import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Dùng các API này thay cho next/link và next/navigation để giữ đúng locale hiện tại
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
