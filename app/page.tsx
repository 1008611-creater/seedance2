import { Image2Workbench } from "@/components/image2-workbench";
import { loadImage2WorkbenchData } from "@/lib/image2-workbench-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadImage2WorkbenchData();
  return <Image2Workbench initialData={data} />;
}
