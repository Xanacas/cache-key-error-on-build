export async function getLatestProjects() {
    "use cache";

    /* In real life, this would be a call to a database */
    return [
        { id: "1", name: "Project 1" },
        { id: "2", name: "Project 2" },
    ];
}
