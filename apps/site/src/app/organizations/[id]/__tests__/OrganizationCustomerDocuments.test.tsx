/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import OrganizationCustomerDocuments from "../OrganizationCustomerDocuments";
import type { OrganizationUserDocumentSummary } from "../organizationCustomerModel";

const document: OrganizationUserDocumentSummary = {
  signedDocumentRecordId: "signed-1",
  documentId: "document-1",
  templateId: "template-1",
  title: "Adult waiver",
  type: "PDF",
  provenance: "IMPORTED",
  status: "SIGNED",
  viewUrl: "/documents/signed-1",
};
const onView = jest.fn();
const onVoid = jest.fn();
const onAudit = jest.fn();
const controls = {
  canViewImportedDocuments: true,
  canVoidDocuments: true,
  canViewDocumentAudit: true,
  onView,
  onVoid,
  onAudit,
};

beforeEach(() => jest.clearAllMocks());

it("applies imported document permissions independently to viewing, voiding, and audit actions", () => {
  const { rerender } = render(
    <OrganizationCustomerDocuments
      documents={[document]}
      controls={{
        ...controls,
        canViewImportedDocuments: false,
        canVoidDocuments: false,
      }}
    />,
  );
  fireEvent.click(screen.getByText("Adult waiver"));
  expect(onView).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "View PDF" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Void", exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Audit trail" }));
  expect(onAudit).toHaveBeenCalledWith(document);
  expect(onView).not.toHaveBeenCalled();

  rerender(
    <OrganizationCustomerDocuments
      documents={[document]}
      controls={controls}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "View PDF" }));
  expect(onView).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Void", exact: true }));
  expect(onVoid).toHaveBeenCalledWith(document);
  expect(onView).toHaveBeenCalledTimes(1);
});

it("prevents repeated voiding and permits keyboard preview of an ordinary signed document", () => {
  const { rerender } = render(
    <OrganizationCustomerDocuments
      documents={[{ ...document, status: "VOID" }]}
      controls={controls}
    />,
  );
  const voidButton = screen.getByRole("button", { name: "Void", exact: true });
  expect(voidButton).toBeDisabled();
  fireEvent.click(voidButton);
  expect(onVoid).not.toHaveBeenCalled();
  const signedText: OrganizationUserDocumentSummary = {
    ...document,
    type: "TEXT",
    provenance: "PLATFORM",
    viewUrl: undefined,
  };
  rerender(
    <OrganizationCustomerDocuments
      documents={[signedText]}
      controls={{ ...controls, canViewImportedDocuments: false }}
    />,
  );
  fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
  expect(onView).toHaveBeenCalledWith(signedText);
});
