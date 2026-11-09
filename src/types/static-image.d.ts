declare module "*.webp" {
  import type { StaticImageData } from "next/image";

  const image: StaticImageData;
  export default image;
}

declare module "*.jpg" {
  import type { StaticImageData } from "next/image";

  const image: StaticImageData;
  export default image;
}
