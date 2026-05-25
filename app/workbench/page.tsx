import { Image2Workbench } from "@/components/image2-workbench";
import { loadPublicImage2WorkbenchData } from "@/lib/image2-workbench-data";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const data = await loadPublicImage2WorkbenchData();
  return <Image2Workbench initialData={data} />;
}
