// We test the crypto and db modules which are the most critical.
// Full proxy integration tests run in the Docker test container.

mod crypto_tests {
    use api_proxy::crypto;
    use std::fs;
    use std::path::Path;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = {
            let mut k = [0u8; 32];
            use rand::RngCore;
            rand::rngs::OsRng.fill_bytes(&mut k);
            k
        };

        let original = "sk-abc123-real-api-key";
        let encrypted = crypto::encrypt(original, &key).expect("encrypt should succeed");
        let decrypted = crypto::decrypt(&encrypted, &key).expect("decrypt should succeed");
        assert_eq!(original, decrypted);
    }

    #[test]
    fn different_nonces_produce_different_ciphertexts() {
        let key = {
            let mut k = [0u8; 32];
            use rand::RngCore;
            rand::rngs::OsRng.fill_bytes(&mut k);
            k
        };

        let enc1 = crypto::encrypt("test", &key).unwrap();
        let enc2 = crypto::encrypt("test", &key).unwrap();
        assert_ne!(enc1, enc2, "random nonces should produce different ciphertexts");
    }

    #[test]
    fn wrong_key_fails_decryption() {
        let key1 = {
            let mut k = [0u8; 32];
            use rand::RngCore;
            rand::rngs::OsRng.fill_bytes(&mut k);
            k
        };
        let key2 = {
            let mut k = [0u8; 32];
            use rand::RngCore;
            rand::rngs::OsRng.fill_bytes(&mut k);
            k
        };

        let encrypted = crypto::encrypt("secret", &key1).unwrap();
        let result = crypto::decrypt(&encrypted, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn load_or_generate_master_key_creates_file() {
        let tmp_path = format!("/tmp/test-master-key-{}", std::process::id());
        // Ensure the file doesn't exist
        let _ = fs::remove_file(&tmp_path);

        let key = crypto::load_or_generate_master_key(&tmp_path).unwrap();
        assert_eq!(key.len(), 32);

        // File should now exist
        assert!(Path::new(&tmp_path).exists());

        // Loading again should return the same key
        let key2 = crypto::load_or_generate_master_key(&tmp_path).unwrap();
        assert_eq!(key, key2);

        let _ = fs::remove_file(&tmp_path);
    }
}

mod llm_tests {
    use api_proxy::llm;

    #[test]
    fn detects_openai_host() {
        assert!(llm::is_llm_request("api.openai.com"));
        assert!(llm::is_llm_request("API.OPENAI.COM"));
        assert!(!llm::is_llm_request("example.com"));
    }

    #[test]
    fn extracts_openai_usage() {
        let body = br#"{
            "model": "gpt-4",
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        }"#;

        let usage = llm::extract_token_usage("api.openai.com", body).unwrap();
        assert_eq!(usage.model.as_deref(), Some("gpt-4"));
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn extracts_anthropic_usage() {
        let body = br#"{
            "model": "claude-3-opus-20240229",
            "usage": {
                "input_tokens": 200,
                "output_tokens": 80
            }
        }"#;

        let usage = llm::extract_token_usage("api.anthropic.com", body).unwrap();
        assert_eq!(usage.model.as_deref(), Some("claude-3-opus-20240229"));
        assert_eq!(usage.input_tokens, 200);
        assert_eq!(usage.output_tokens, 80);
        assert_eq!(usage.total_tokens, 280);
    }

    #[test]
    fn extracts_google_usage() {
        let body = br#"{
            "modelVersion": "gemini-1.5-pro",
            "usageMetadata": {
                "promptTokenCount": 300,
                "candidatesTokenCount": 120,
                "totalTokenCount": 420
            }
        }"#;

        let usage =
            llm::extract_token_usage("generativelanguage.googleapis.com", body).unwrap();
        assert_eq!(usage.model.as_deref(), Some("gemini-1.5-pro"));
        assert_eq!(usage.input_tokens, 300);
        assert_eq!(usage.output_tokens, 120);
        assert_eq!(usage.total_tokens, 420);
    }

    #[test]
    fn returns_none_for_non_llm_response() {
        let body = br#"{"data": "not an LLM response"}"#;
        assert!(llm::extract_token_usage("api.openai.com", body).is_none());
    }
}

mod firewall_tests {
    use api_proxy::firewall::{
        check_firewall, check_rate_limit, check_registry, check_token_limit,
        AlertConfig, FirewallAction, FirewallRule, LimitAction, RateLimitTracker,
        RegistryAction, RegistryRule,
    };

    #[test]
    fn firewall_blocks_by_host() {
        let rules = vec![FirewallRule {
            rule_type: "host".to_string(),
            pattern: "evil.com".to_string(),
            action: "block".to_string(),
            priority: 0,
        }];

        match check_firewall(&rules, "evil.com", "/", &[]) {
            FirewallAction::Block(_) => {}
            other => panic!("Expected Block, got {:?}", other),
        }
    }

    #[test]
    fn firewall_allows_unmatched() {
        let rules = vec![FirewallRule {
            rule_type: "host".to_string(),
            pattern: "evil.com".to_string(),
            action: "block".to_string(),
            priority: 0,
        }];

        match check_firewall(&rules, "good.com", "/", &[]) {
            FirewallAction::Continue => {}
            other => panic!("Expected Continue, got {:?}", other),
        }
    }

    #[test]
    fn registry_allows_matching_method_path() {
        let rules = vec![RegistryRule {
            domain: "api.openai.com".to_string(),
            allowed_methods: vec!["POST".to_string()],
            path_pattern: "/v1/.*".to_string(),
            rate_limit: None,
        }];

        match check_registry(&rules, "POST", "/v1/chat/completions") {
            RegistryAction::Allow => {}
            other => panic!("Expected Allow, got {:?}", other),
        }
    }

    #[test]
    fn registry_denies_wrong_method() {
        let rules = vec![RegistryRule {
            domain: "api.openai.com".to_string(),
            allowed_methods: vec!["POST".to_string()],
            path_pattern: "/v1/.*".to_string(),
            rate_limit: None,
        }];

        match check_registry(&rules, "DELETE", "/v1/chat/completions") {
            RegistryAction::Deny(_) => {}
            other => panic!("Expected Deny, got {:?}", other),
        }
    }

    #[test]
    fn rate_limit_allows_within_limit() {
        let tracker = RateLimitTracker::new();
        assert!(check_rate_limit(&tracker, "app1", "api.openai.com", Some(100)));
    }

    #[test]
    fn token_limit_hard_block() {
        let config = AlertConfig {
            limit_type: "daily".to_string(),
            threshold: 1000,
            hard_limit: Some(5000),
        };

        match check_token_limit(6000, &config) {
            LimitAction::HardBlock(_) => {}
            other => panic!("Expected HardBlock, got {:?}", other),
        }
    }

    #[test]
    fn token_limit_alert() {
        let config = AlertConfig {
            limit_type: "daily".to_string(),
            threshold: 1000,
            hard_limit: Some(5000),
        };

        match check_token_limit(2000, &config) {
            LimitAction::Alert(_) => {}
            other => panic!("Expected Alert, got {:?}", other),
        }
    }

    #[test]
    fn token_limit_ok() {
        let config = AlertConfig {
            limit_type: "daily".to_string(),
            threshold: 1000,
            hard_limit: Some(5000),
        };

        match check_token_limit(500, &config) {
            LimitAction::Ok => {}
            other => panic!("Expected Ok, got {:?}", other),
        }
    }
}

mod mock_tests {
    use api_proxy::mock::{check_mock, MockCapture};

    #[test]
    fn returns_mock_for_matching_simulation() {
        let captures = vec![MockCapture {
            method: "POST".to_string(),
            url_pattern: r"https://api\.openai\.com/v1/chat/completions".to_string(),
            request_headers: None,
            request_body: None,
            response_status: 200,
            response_headers: Some(r#"{"Content-Type": "application/json"}"#.to_string()),
            response_body: Some(r#"{"choices": [{"message": {"content": "mock"}}]}"#.to_string()),
            is_simulation: true,
        }];

        let result = check_mock(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            &captures,
        );
        assert!(result.is_some());
        let resp = result.unwrap();
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("mock"));
    }

    #[test]
    fn skips_non_simulation_captures() {
        let captures = vec![MockCapture {
            method: "GET".to_string(),
            url_pattern: ".*".to_string(),
            request_headers: None,
            request_body: None,
            response_status: 200,
            response_headers: None,
            response_body: Some("recorded".to_string()),
            is_simulation: false,
        }];

        assert!(check_mock("GET", "https://example.com", &captures).is_none());
    }
}
