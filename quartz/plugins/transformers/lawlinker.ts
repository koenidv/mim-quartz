import { QuartzTransformerPlugin } from "../types"
import { Root, Paragraph, Text } from "mdast"
import { findAndReplace as mdastFindReplace } from "mdast-util-find-and-replace"

/**
 * Regex for German law references.
 * Matches: § 238 BGB, §§ 1, 2 BGB, Art. 1 GG, § 123 Abs. 1 Satz 2 StGB, § 123 I 2 BGB, etc.
 * Also matches sections without law book if followed by something else or end of line.
 * Group 1: Primary section bunch (e.g. "280 I, 241 II, 249 I")
 * Group 2: Law name (including optional Roman numerals like SGB II) - now optional
 */
export const LAW_REGEX = /(?:§+|Art\.?|Artikel)\s*((?:\d+[a-z]?|\(\d+\))(?:\s*(?:[,/–\-]|und|bis|u\.?|Abs\b\.?|Satz\b|S\b\.?|f\b\.?|ff\b\.?|[IVXLCDM]+\b|\(\d+\)|\d+[a-z]?\b)\s*)*)(?:\s+([A-ZÄÖÜß][a-zA-ZÄÖÜß0-9-]+(?:\s+(?:[IVXLCDM]+|[0-9]+))?))?/g;

/**
 * Regex for parsing individual sections out of a bunch.
 * Group 3 matches primary section numbers, while groups 1/2 catch attributes to ignore.
 */
export const SECTION_PARSER = /(Abs\b\.?|Satz\b|S\b\.?)\s*(\d+[a-z]?)|(\d+[a-z]?)/g;

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
    if (!law) return "";
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
          return (tree: Root, file) => {
            const defaultLaw = file.data.frontmatter?.default_law as string | undefined;

            // Add disclaimer at the top if defaultLaw is set
            if (defaultLaw) {
              const disclaimer: Paragraph = {
                type: 'paragraph',
                children: [
                  { 
                    type: 'text', 
                    value: 'References without law book default to ' 
                  },
                  {
                    type: 'strong',
                    children: [{ type: 'text', value: defaultLaw }]
                  },
                  { type: 'text', value: '.' }
                ],
                data: {
                  hProperties: {
                    className: ['law-disclaimer']
                  }
                }
              };
              tree.children.unshift(disclaimer);
            }

            mdastFindReplace(tree, [
              [
                LAW_REGEX,
                (fullMatch: string, sectionBunch: string, lawMatch: string) => {
                  const law = lawMatch || defaultLaw;
                  if (!law) return false;

                  const parts = sectionBunch.split(/([,/–\-]|und|bis)/);
                  const filteredParts = parts.filter(p => p.length > 0);
                  const bunchIndex = fullMatch.indexOf(sectionBunch);
                  const prefix = fullMatch.slice(0, bunchIndex);
                  const suffix = fullMatch.slice(bunchIndex + sectionBunch.length);

                  const children: any[] = [];
                  let currentSection = "";

                  filteredParts.forEach((part, i) => {
                    const isSeparator = /[,/–\-]|und|bis/.test(part);
                    if (isSeparator) {
                      children.push({ type: "text", value: part });
                    } else {
                      const trimmed = part.trim();
                      const sectionMatch = trimmed.match(/^\d+[a-z]?/);
                      if (sectionMatch) currentSection = sectionMatch[0];

                      let linkText = part;
                      if (i === 0) linkText = prefix + linkText;
                      if (i === filteredParts.length - 1) linkText = linkText + suffix;

                      if (currentSection) {
                        children.push({
                          type: "link",
                          url: getUrl(law, currentSection),
                          children: [{ type: "text", value: linkText }],
                          data: {
                            hProperties: {
                              target: "_blank",
                              rel: "noopener",
                              className: ["external-link", "law-link"],
                            },
                          },
                        });
                      } else {
                        children.push({ type: "text", value: linkText });
                      }
                    }
                  });

                  return children;
                },
              ],
            ])
          }
        },
      ]
    },
  }
}
