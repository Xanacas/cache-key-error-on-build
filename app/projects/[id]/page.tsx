import { unstable_cacheLife as cacheLife } from "next/cache";
import { unstable_cacheTag as cacheTag } from "next/cache";

export default async function ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    "use cache";
    const { id } = await params;

    return <>{id}</>;
}
