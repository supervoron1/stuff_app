import { InventoryApp } from "@/components/inventory";
import { PwaRegister } from "@/components/pwa-register";
import { ScrollToTop } from "@/components/scroll-to-top";

export default function Home() {
  return (
    <>
      <PwaRegister />
      <ScrollToTop />
      <InventoryApp />
    </>
  );
}