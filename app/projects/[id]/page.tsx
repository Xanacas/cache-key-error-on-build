import { notFound } from "next/navigation";
import { getLatestProjects } from "@/data-access-layer/projects";
import { unstable_cacheLife as cacheLife } from "next/cache";
import { unstable_cacheTag as cacheTag } from "next/cache";

async function getProject(id: string) {
    const recentProjects = await getLatestProjects();
    const project = recentProjects.find((project) => project.id === id);

    if (!project) {
        console.log("not found");
        notFound();
    }

    return project;
}

export default async function ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    "use cache";
    cacheLife("minutes");

    cacheTag("projects");
    const { id } = await params;
    const project = await getProject(id);

    if (!project) {
        console.log("not found2");
        notFound();
    }

    return <>{project.name}</>;
}

export async function generateStaticParams() {
    const projects = await getLatestProjects();
    console.log("generating static params", { projects });
    return projects.map((project) => ({
        id: project.id,
    }));
}
