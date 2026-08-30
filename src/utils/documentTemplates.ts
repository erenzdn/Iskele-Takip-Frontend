import { ContractTemplate, QuoteTemplate } from '../models';
import { isKullanimExtresiTemplateName } from '../constants/urunEkstresiTemplateContent';

export type ContractDocumentKind = 'contract' | 'extre';
export type DocumentTemplateKind = 'quote' | ContractDocumentKind;

export function isExtreContractTemplate(template: Pick<ContractTemplate, 'TemplateName'>): boolean {
  return isKullanimExtresiTemplateName(template.TemplateName);
}

export function partitionContractTemplates(templates: ContractTemplate[]) {
  const extreTemplates: ContractTemplate[] = [];
  const contractTemplates: ContractTemplate[] = [];
  for (const template of templates) {
    if (isExtreContractTemplate(template)) {
      extreTemplates.push(template);
    } else {
      contractTemplates.push(template);
    }
  }
  return { contractTemplates, extreTemplates };
}

export function filterContractTemplatesByKind(
  templates: ContractTemplate[],
  kind: ContractDocumentKind
): ContractTemplate[] {
  const { contractTemplates, extreTemplates } = partitionContractTemplates(templates);
  return kind === 'extre' ? extreTemplates : contractTemplates;
}

export function pickDefaultTemplateId(
  templates: Array<Pick<QuoteTemplate, 'TemplateId' | 'IsDefault'>>
): number | '' {
  if (templates.length === 0) return '';
  const defaultTemplate = templates.find((t) => t.IsDefault);
  return (defaultTemplate ?? templates[0]).TemplateId;
}

export const CONTRACT_DOCUMENT_KIND_LABELS: Record<ContractDocumentKind, string> = {
  contract: 'Sözleşme',
  extre: 'Kullanım Extresi',
};
