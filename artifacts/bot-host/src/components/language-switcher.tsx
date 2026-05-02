import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Change language"
        >
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="hidden sm:inline">{current.flag}</span>
          <span className="hidden md:inline text-xs font-semibold uppercase">{current.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = lang.code === current.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{lang.flag}</span>
                <span className="text-sm">{lang.label}</span>
              </span>
              {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
