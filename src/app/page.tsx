import { redirect } from "next/navigation";

/**
 * Route "/" menayangkan dashboard statis yang hidup di /index.html
 * (file asli proyek BCA-IDX + main.js yang telah di-online-kan).
 * next.config.ts memakai rewrite beforeFiles "/" → "/index.html";
 * redirect ini hanya cadangan bila rewrite tidak aktif.
 */
export default function Home() {
  redirect("/index.html");
}
