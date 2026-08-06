import { InventoryApp } from "@/components/inventory";
import { PwaRegister } from "@/components/pwa-register";

export default function Home() {
  return (
    <>
      <PwaRegister />
      <InventoryApp />
    </>
  );
}