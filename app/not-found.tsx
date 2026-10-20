import { DeskFailure } from "@/components/desk/desk-failure";
import { DESK_FAILURES } from "@/lib/desk-states";

export default function NotFound() {
  return <DeskFailure copy={DESK_FAILURES["not-found"]} />;
}
