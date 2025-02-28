import ProjectComponent from "./component";
import { Suspense } from "react";
export default async function ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    "use cache";
    const paramsPromise = params;

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProjectComponent params={paramsPromise} />
        </Suspense>
    );
}
export const generateStaticParams = async () => {
    return [{ id: "1" }, { id: "2" }];
};
