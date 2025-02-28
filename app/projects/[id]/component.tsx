export default async function ProjectComponent({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <div>{id}</div>;
}
