# PDF 字型

`NotoSansCJKtc-Regular.otf` 為未修改的 Noto Sans CJK TC 字型，沿用本任務原型已取得的同一檔案。

上游來源：https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf

授權：SIL Open Font License 1.1，完整條文見 `OFL.txt`。

只供伺服器產生 PDF 時讀取；不透過 public 靜態目錄或外部字型 API 提供。
PDFKit 將實際使用的字元子集內嵌於 PDF。Next 的兩個 PDF 路由 tracing 明確包含此資產。
