"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/sheet";

import { type ShellUser, SidebarContent } from "./sidebar-content";

/** Mobile drawer (montage panel 12): the same sidebar content in a slide-over panel. */
export function MobileNav({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent title="Navigation">
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
