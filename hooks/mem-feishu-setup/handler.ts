export default async function handler(event: unknown): Promise<void> {
  const payload = event as { type?: string; action?: string };
  if (payload.type !== "gateway" || payload.action !== "startup") {
    return;
  }
  console.log("[mem-feishu-setup] gateway startup");
}
