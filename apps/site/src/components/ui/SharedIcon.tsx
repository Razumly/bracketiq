import type { SVGProps } from "react";

import {
  SHARED_ICON_ASSET_HREFS,
  SHARED_ICON_KEYS,
  SHARED_ICON_VIEWBOXES,
  type SharedIconKey,
} from "./sharedIconManifest.generated";

export { SHARED_ICON_KEYS };
export type { SharedIconKey };

export type SharedIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "height" | "width" | "aria-label"
> & {
  name: SharedIconKey;
  size?: number | string;
  label?: string;
};

export function SharedIcon({
  name,
  size = 20,
  label,
  ...props
}: SharedIconProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox={SHARED_ICON_VIEWBOXES[name]}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-shared-icon={name}
    >
      {label ? <title>{label}</title> : null}
      <use href={SHARED_ICON_ASSET_HREFS[name]} />
    </svg>
  );
}

export default SharedIcon;
