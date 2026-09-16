"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, Button, Container } from "@/components/organization/organization-operation-ui";
import { useApp } from "@/app/providers";
import { buildPublicOrganizationPath } from "@/lib/publicOrganizationSlug";
import RentalReservationCheckout from "@/components/rentals/RentalReservationCheckout";
import type { Organization } from "@/types";
import PublicRentalAvailability from "./PublicRentalAvailability";

type PublicRentalSelectionClientProps = {
  slug: string;
  organization: Organization;
};

export default function PublicRentalSelectionClient({ slug, organization }: PublicRentalSelectionClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const returnHref = buildPublicOrganizationPath(slug);

  return (
    <Container size="xl" py="xl" className="space-y-6 text-foreground">
      <header className="space-y-4">
        <Button component="a" href={returnHref} variant="subtle" leftSection={<ArrowLeft aria-hidden="true" className="size-4" />}>Back to {organization.name}</Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reserve a resource</h1>
          <p className="mt-2 text-muted-foreground">Choose your venue and time, then review your reservation.</p>
        </div>
      </header>
      {!authLoading && !user && <Alert color="yellow" title="Sign in required">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>You can view available times. Sign in before reserving resources.</p>
          <Button variant="default" onClick={() => router.push("/login")}>Sign in</Button>
        </div>
      </Alert>}
      <RentalReservationCheckout organization={organization} rentalOrderSlug={slug} currentUser={user}>
        {({ onRentalSelectionReady }) => organization.fields?.length
          ? <PublicRentalAvailability organization={organization} currentUser={user} authLoading={authLoading} onRentalSelectionReady={onRentalSelectionReady} />
          : <Alert title="No rentals available">This organization does not have public rental slots available right now.</Alert>}
      </RentalReservationCheckout>
    </Container>
  );
}
