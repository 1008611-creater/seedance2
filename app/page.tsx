import { Image2PublicHome } from "@/components/image2-public-home";
import { loadImage2PublicHomeData } from "@/lib/image2-workbench-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadImage2PublicHomeData();
  return <Image2PublicHome initialData={data} />;
}
