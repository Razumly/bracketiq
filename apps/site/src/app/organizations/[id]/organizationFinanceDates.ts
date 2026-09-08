export const dateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const monthStartValue = (): string => {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
};

export const dateInputToIso = (
  value: string,
  endOfDay = false,
): string | null => {
  if (!value.trim()) {
    return null;
  }
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const dateValueFromIso = (value?: string | null): string => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return dateInputValue(parsed);
};
