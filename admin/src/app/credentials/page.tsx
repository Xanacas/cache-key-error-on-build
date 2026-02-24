import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function CredentialsPage() {
  const credentials = await prisma.credential.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      provider: {
        select: { id: true, name: true, authType: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Credentials</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage API keys and OAuth credentials for providers
          </p>
        </div>
        <Link
          href="/credentials/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Add Credential
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Label</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Provider</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Type</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Created</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {credentials.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No credentials configured yet.{" "}
                  <Link
                    href="/credentials/new"
                    className="text-blue-400 hover:underline"
                  >
                    Add your first credential
                  </Link>
                </td>
              </tr>
            ) : (
              credentials.map((cred) => (
                <tr
                  key={cred.id}
                  className="transition-colors hover:bg-zinc-700/30"
                >
                  <td className="px-4 py-3 font-medium text-zinc-100">
                    {cred.label || "Unlabeled"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/providers/${cred.provider.id}`}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {cred.provider.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {cred.apiKeyEncrypted ? (
                      <span className="inline-flex rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                        API Key
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
                        OAuth
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(cred.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <DeleteCredentialButton credentialId={cred.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeleteCredentialButton({ credentialId }: { credentialId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const { prisma: db } = await import("@/lib/prisma");
        await db.credential.delete({ where: { id: credentialId } });
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/credentials");
      }}
    >
      <button
        type="submit"
        className="text-sm text-red-400 transition-colors hover:text-red-300"
      >
        Delete
      </button>
    </form>
  );
}
