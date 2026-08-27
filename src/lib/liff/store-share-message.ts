import { buildShareText } from "@/lib/share";
import type { LiffShareMessages } from "@/lib/liff/client";

export function buildLiffStoreShareMessages(input: {
  storeName: string;
  referralUrl: string;
  shareTemplate: string | null;
  address: string | null;
  mapUrl: string | null;
}): LiffShareMessages {
  const rendered = buildShareText({
    storeName: input.storeName,
    url: input.referralUrl,
    template: input.shareTemplate,
  });
  const messageBody = rendered
    .replace(input.referralUrl, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const mapButton =
    input.mapUrl && input.mapUrl.startsWith("https://")
      ? [
          {
            type: "button" as const,
            style: "secondary" as const,
            height: "sm" as const,
            action: {
              type: "uri" as const,
              label: "Google Maps 導航",
              uri: input.mapUrl,
            },
          },
        ]
      : [];

  return [
    {
      type: "flex",
      altText: `推薦你來看看 ${input.storeName}`,
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "20px",
          contents: [
            {
              type: "text",
              text: "朋友推薦",
              size: "xs",
              weight: "bold",
              color: "#6B7B57",
            },
            {
              type: "text",
              text: input.storeName,
              size: "xl",
              weight: "bold",
              color: "#342F27",
              wrap: true,
            },
            {
              type: "text",
              text: messageBody,
              size: "sm",
              color: "#665F55",
              wrap: true,
              lineSpacing: "5px",
            },
            ...(input.address
              ? [
                  {
                    type: "box" as const,
                    layout: "vertical" as const,
                    margin: "md" as const,
                    paddingAll: "12px",
                    backgroundColor: "#F5F2EB",
                    cornerRadius: "12px",
                    contents: [
                      {
                        type: "text" as const,
                        text: input.address,
                        size: "xs" as const,
                        color: "#756D62",
                        wrap: true,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "16px",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#6B7B57",
              action: {
                type: "uri",
                label: "預約體驗",
                uri: input.referralUrl,
              },
            },
            ...mapButton,
          ],
        },
      },
    },
  ];
}
