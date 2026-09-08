import { Check, Clock } from "lucide-react";
import {
  Button,
  Group,
  Loader,
  Text,
} from "@/components/organization/organization-operation-ui";
import type { getPaymentModalCopy } from "./paymentModalCopy";

type PaymentResultViewProps = {
  view: "success" | "pending";
  reloading: boolean;
  copy: ReturnType<typeof getPaymentModalCopy>;
  onClose: () => void;
};

const resultContent = {
  success: {
    Icon: Check,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    title: "Payment successful",
    description: "Payment succeeded. We’re refreshing the details now.",
  },
  pending: {
    Icon: Clock,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    title: "Payment pending",
    description:
      "Your bank payment is processing. You are marked as pending until Stripe confirms the payment.",
  },
};

export function PaymentResultView({
  view,
  reloading,
  copy,
  onClose,
}: PaymentResultViewProps) {
  const { Icon, tone, title, description } = resultContent[view];
  return (
    <div className="space-y-4 text-center">
      <div
        className={`mx-auto flex size-14 items-center justify-center rounded-full ${tone}`}
      >
        <Icon aria-hidden="true" className="size-8" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
      <div role="status">
        {reloading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
            <Loader size="sm" />
            <span>{copy.reloadingMessage}</span>
          </div>
        ) : (
          <Text size="sm" c="dimmed">
            {copy.refreshedMessage}
          </Text>
        )}
      </div>
      <Group justify="center" mt="md">
        <Button onClick={onClose}>Close</Button>
      </Group>
    </div>
  );
}
