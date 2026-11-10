/**
 * Editörün dışa aktardığı JSON'u (Önizle düğmesinin gönderdiğiyle aynı) backend'in kendi
 * önizleme koduyla PDF'e basar — canlıdaki POST /contract-templates/preview-content ile aynı yol.
 * Kullanım (backend klasöründe): node <bu dosya> <backendDir> <outDir> <editor-*.json ...>
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';

const [backendDir, outDir, ...inputs] = process.argv.slice(2);
const { generateTemplatePreview } = await import(
  pathToFileURL(join(backendDir, 'src/services/documentPreviewService.js')).href
);
const { shutdown } = await import(pathToFileURL(join(backendDir, 'src/services/pdfService.js')).href);

const rendered = new Set();
for (const input of inputs) {
  // PDF ekran ölçeğinden bağımsızdır; editor-15-15-15-15@1.25.json → pdf-15-15-15-15.pdf
  const out = join(outDir, basename(input).replace(/^editor-/, 'pdf-').replace(/(@[\d.]+)?\.json$/, '.pdf'));
  if (rendered.has(out)) continue;
  rendered.add(out);
  const { exportContent } = JSON.parse(readFileSync(input, 'utf8'));
  const pdf = await generateTemplatePreview(exportContent);
  writeFileSync(out, pdf);
  console.log(`pdf: ${out} (${pdf.length} bayt)`);
}
await shutdown();
process.exit(0);
