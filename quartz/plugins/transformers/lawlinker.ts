import { QuartzTransformerPlugin } from "../types"
import { Root } from "mdast"
import { findAndReplace as mdastFindReplace } from "mdast-util-find-and-replace"

export const LAW_REGEX = /(?:§+|Art\.?|Artikel)\s*(\d+[a-z]?)(?:(?:\s+(?:Abs\.?|Satz|S\.?|[IVXLCDM]+|\d+))*)?\s+([A-ZÄÖÜß][a-zA-ZÄÖÜß0-9-]+(?:\s+(?:[IVXLCDM]+|[0-9]+))?)/g;

const LAW_MAPPING: Record<string, string> = {
    "GG": "gg",
    "BGB": "bgb",
    "STGB": "stgb",
    "HGB": "hgb",
    "ZPO": "zpo",
    "STPO": "stpo",
    "VWGO": "vwgo",
    "STVG": "stvg",
    "EGBGB": "egbgb",
    "GKG": "gkg",
    "RVG": "rvg",
    "BAUGB": "baugb",
    "USTG": "ustg",
    "ESTG": "estg",
    "AO": "ao",
    "OWIG": "owig",
    "VWVFG": "vwvfg",
};

const ROMAN_MAP: Record<string, string> = {
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
    "XI": "11", "XII": "12", "XIV": "14"
};

export function getUrl(law: string, section: string): string {
    const lawUpper = law.toUpperCase().trim();
    let slug = "";
    
    if (lawUpper.startsWith("SGB")) {
        const parts = lawUpper.split(/\s+/);
        if (parts.length > 1) {
            const num = ROMAN_MAP[parts[1]] || parts[1];
            slug = `sgb_${num}`;
        } else {
            slug = "sgb_1";
        }
    } else {
        slug = LAW_MAPPING[lawUpper] || law.toLowerCase().trim().replace(/\s+/, "_");
    }
    
    return `https://www.gesetze-im-internet.de/${slug}/__${section}.html`;
}

export const LawLinker: QuartzTransformerPlugin = () => {
  return {
    name: "LawLinker",
    markdownPlugins() {
      return [
        () => {
          return (tree: Root) => {
            mdastFindReplace(tree, [
              [
                LAW_REGEX,
                (fullMatch: string, section: string, law: string) => {
                  return {
                    type: "link",
                    url: getUrl(law, section),
                    children: [{ type: "text", value: fullMatch }],
                    data: {
                      hProperties: {
                        target: "_blank",
                        rel: "noopener",
                        className: ["external-link", "law-link"],
                      },
                    },
                  }
                },
              ],
            ])
          }
        },
      ]
    },
  }
}
