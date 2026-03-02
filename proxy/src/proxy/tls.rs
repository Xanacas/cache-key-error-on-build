use std::sync::Arc;

use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
    KeyUsagePurpose,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;
use tracing::info;

use crate::{AppError, AppState};

// ---------------------------------------------------------------------------
// CA Authority - holds the root CA cert + key used to sign per-domain certs
// ---------------------------------------------------------------------------

pub struct CaAuthority {
    /// The DER-encoded CA certificate (for inclusion in cert chains).
    pub ca_cert_der: CertificateDer<'static>,
    /// The CA params parsed back from the CA cert (for signing domain certs).
    pub ca_params: CertificateParams,
    /// The CA key pair (for signing domain certs).
    pub ca_key_pair: KeyPair,
}

impl CaAuthority {
    /// Load the CA from disk or generate a new self-signed CA.
    /// Paths are configurable via `CA_CERT_PATH` and `CA_KEY_PATH` env vars.
    pub fn load_or_generate() -> Result<Self, AppError> {
        let cert_path_str = std::env::var("CA_CERT_PATH")
            .unwrap_or_else(|_| "ca_cert.pem".to_string());
        let key_path_str = std::env::var("CA_KEY_PATH")
            .unwrap_or_else(|_| "ca_key.pem".to_string());
        let ca_cert_path = std::path::Path::new(&cert_path_str);
        let ca_key_path = std::path::Path::new(&key_path_str);

        if ca_cert_path.exists() && ca_key_path.exists() {
            info!("Loading existing CA certificate");
            let cert_pem = std::fs::read_to_string(ca_cert_path)
                .map_err(|e| AppError::Internal(format!("Failed to read CA cert: {}", e)))?;
            let key_pem = std::fs::read_to_string(ca_key_path)
                .map_err(|e| AppError::Internal(format!("Failed to read CA key: {}", e)))?;

            let key_pair = KeyPair::from_pem(&key_pem)?;

            // Parse the CA cert back into CertificateParams using x509-parser feature.
            let ca_params = CertificateParams::from_ca_cert_pem(&cert_pem)?;

            // Parse the DER from the PEM
            let ca_cert_der = pem_to_der(&cert_pem)?;

            Ok(Self {
                ca_cert_der,
                ca_params,
                ca_key_pair: key_pair,
            })
        } else {
            info!("Generating new CA certificate");
            let ca = Self::generate_ca()?;

            // Persist to disk
            let cert_pem = ca.ca_cert_pem();
            let key_pem = ca.ca_key_pair.serialize_pem();
            std::fs::write(ca_cert_path, &cert_pem)
                .map_err(|e| AppError::Internal(format!("Failed to write CA cert: {}", e)))?;
            std::fs::write(ca_key_path, &key_pem)
                .map_err(|e| AppError::Internal(format!("Failed to write CA key: {}", e)))?;

            Ok(ca)
        }
    }

    fn generate_ca() -> Result<Self, AppError> {
        let mut params = CertificateParams::default();
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, "API Proxy CA");
        dn.push(DnType::OrganizationName, "API Proxy");
        params.distinguished_name = dn;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];

        // Set validity to 10 years
        let now = time::OffsetDateTime::now_utc();
        params.not_before = now;
        params.not_after = now + time::Duration::days(3650);

        let key_pair = KeyPair::generate()?;

        // Self-sign to produce a Certificate
        let ca_cert = params.clone().self_signed(&key_pair)?;

        let ca_cert_der = CertificateDer::from(ca_cert.der().to_vec());

        // Parse the params back from the DER for later signing operations
        let ca_params = CertificateParams::from_ca_cert_der(ca_cert.der())?;

        Ok(Self {
            ca_cert_der,
            ca_params,
            ca_key_pair: key_pair,
        })
    }

    /// Return the CA certificate in PEM format (for clients to trust).
    pub fn ca_cert_pem(&self) -> String {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(self.ca_cert_der.as_ref());
        let mut pem = String::from("-----BEGIN CERTIFICATE-----\n");
        for chunk in b64.as_bytes().chunks(76) {
            pem.push_str(std::str::from_utf8(chunk).unwrap_or(""));
            pem.push('\n');
        }
        pem.push_str("-----END CERTIFICATE-----\n");
        pem
    }

    /// Generate a certificate for the given domain, signed by this CA.
    pub fn generate_domain_cert(
        &self,
        domain: &str,
    ) -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), AppError> {
        let mut params = CertificateParams::new(vec![domain.to_string()])?;

        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, domain);
        params.distinguished_name = dn;

        let now = time::OffsetDateTime::now_utc();
        params.not_before = now;
        params.not_after = now + time::Duration::days(365);

        let domain_key = KeyPair::generate()?;

        // We need a Certificate object to pass to signed_by.
        // Reconstruct the CA Certificate by self-signing the CA params with
        // the CA key again. This produces a structurally identical cert.
        let ca_cert = self.ca_params.clone().self_signed(&self.ca_key_pair)?;

        let domain_cert = params.signed_by(&domain_key, &ca_cert, &self.ca_key_pair)?;

        let cert_der = CertificateDer::from(domain_cert.der().to_vec());
        let key_der =
            PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(domain_key.serialize_der()));

        Ok((cert_der, key_der))
    }
}

// ---------------------------------------------------------------------------
// TLS helpers
// ---------------------------------------------------------------------------

/// Get or create a TLS acceptor for the given domain.
/// Caches generated certs in the AppState cert_cache (DashMap).
pub fn get_tls_acceptor(state: &Arc<AppState>, domain: &str) -> Result<TlsAcceptor, AppError> {
    // Check cache first
    let (cert_der, key_der) = if let Some(entry) = state.cert_cache.get(domain) {
        let (c, k) = entry.value();
        (c.clone(), k.clone_key())
    } else {
        // Generate a new domain cert signed by our CA
        let (cert, key) = state.ca.generate_domain_cert(domain)?;
        state
            .cert_cache
            .insert(domain.to_string(), (cert.clone(), key.clone_key()));
        (cert, key)
    };

    let mut server_config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der, state.ca.ca_cert_der.clone()], key_der)?;

    server_config.alpn_protocols = vec![b"http/1.1".to_vec()];

    Ok(TlsAcceptor::from(Arc::new(server_config)))
}

/// Build a rustls ClientConfig that trusts the system webpki roots.
pub fn build_client_tls_config() -> Result<Arc<rustls::ClientConfig>, AppError> {
    let mut root_store = rustls::RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    Ok(Arc::new(config))
}

/// Convert a PEM-encoded certificate string to DER.
fn pem_to_der(pem: &str) -> Result<CertificateDer<'static>, AppError> {
    let mut reader = std::io::BufReader::new(pem.as_bytes());
    let certs = rustls_pemfile::certs(&mut reader)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Internal(format!("Failed to parse PEM: {}", e)))?;
    certs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal("No certificate found in PEM".to_string()))
}
