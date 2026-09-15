import { FlowBoard } from "@/components/flow-board";

export default async function FlowPage({ params }: PageProps<"/flujo/[id]">) {
  const { id } = await params;
  return <FlowBoard id={id} />;
}
