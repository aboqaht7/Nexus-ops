import { SignIn } from "@clerk/react";
import { Link } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const appearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#F26207",
    colorBackground: "#FFFFFF",
    colorForeground: "#0D0D0D",
    colorMutedForeground: "#6B6B6B",
    colorDanger: "#DC2626",
    colorInput: "#FAF7F2",
    colorInputForeground: "#0D0D0D",
    colorNeutral: "#E8DDD5",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!rounded-2xl !border !border-[#E8DDD5] !bg-white !shadow-none",
    footer: "!bg-[#FAF7F2] !border-t !border-[#E8DDD5] !rounded-b-2xl",
    headerTitle: "!text-[#0D0D0D] !font-semibold",
    headerSubtitle: "!text-[#6B6B6B]",
    socialButtonsBlockButton: "!border-[#E8DDD5] !bg-[#FAF7F2] hover:!bg-[#F0EAE3]",
    socialButtonsBlockButtonText: "!text-[#0D0D0D]",
    formFieldLabel: "!text-[#0D0D0D]",
    formFieldInput: "!bg-[#FAF7F2] !border-[#E8DDD5] !text-[#0D0D0D] focus:!border-[#F26207]",
    formButtonPrimary: "!bg-[#F26207] hover:!bg-[#D95600] !text-white !rounded-full",
    footerActionLink: "!text-[#F26207] hover:!text-[#D95600]",
    footerActionText: "!text-[#6B6B6B]",
    dividerText: "!text-[#6B6B6B]",
    dividerLine: "!bg-[#E8DDD5]",
    identityPreviewEditButton: "!text-[#F26207]",
    logoBox: "justify-center",
    logoImage: "h-8 w-8",
    alertText: "!text-red-600",
    formFieldSuccessText: "!text-emerald-600",
    otpCodeFieldInput: "!border-[#E8DDD5] !bg-[#FAF7F2]",
  },
  options: {
    logoPlacement: "inside",
    logoLinkUrl: `${window.location.origin}${basePath}/`,
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
} as const;

export default function SignInPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#FAF7F2", fontFamily: "'Inter', sans-serif" }}>
      {/* Nav */}
      <header style={{
        height: 60, padding: "0 24px",
        display: "flex", alignItems: "center",
        borderBottom: "1px solid #E8DDD5",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#F26207", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
              <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
              <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0D0D0D" }}>
            Nexus<span style={{ color: "#F26207" }}>Ops</span>
          </span>
        </Link>
      </header>

      {/* Content */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px", minHeight: "calc(100dvh - 60px)" }}>
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={`${basePath}/dashboard`}
          appearance={appearance}
        />
      </div>
    </div>
  );
}
