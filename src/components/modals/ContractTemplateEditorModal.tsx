import { useState, useEffect, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { ContractTemplate, TemplateImage } from '../../models';
import { contractTemplateService } from '../../services/contractTemplateService';
import { templateImageService } from '../../services/templateImageService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { CustomImage } from './CustomImageExtension';
import PdfPreviewModal from './PdfPreviewModal';
import { LineHeight } from './LineHeightExtension';
import { FontSize } from './FontSizeExtension';
import {
  CustomTable,
  CustomTableCell,
  CustomTableHeader,
  prepareTemplateContentForExport,
  ensureLayoutTablesBorderless,
} from './CustomTableExtensions';
import TipTapTemplateEditorLayout, {
  type TipTapPlaceholderGroup,
} from './TipTapTemplateEditorLayout';
import {
  DEFAULT_PAGE_MARGINS,
  getPageMargins,
  withPageMargins,
  type PageMargins,
} from './PageMargins';
import {
  DOCUMENT_TEMPLATE_PLACEHOLDERS,
  MATERIAL_TABLE_PLACEHOLDER,
  RETURN_TABLE_PLACEHOLDER,
} from '../../constants/documentTemplatePlaceholders';

interface ContractTemplateEditorModalProps {
  template: ContractTemplate | null;
  isNew: boolean;
  onClose: () => void;
  onSave?: (templateId: number) => void;
}

const PLACEHOLDER_GROUPS: TipTapPlaceholderGroup[] = [
  { id: 'musteri', title: 'Müşteri', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.musteri },
  { id: 'santiye', title: 'Şantiye', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.santiye },
  { id: 'sozlesme', title: 'Sözleşme', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.sozlesme },
  { id: 'cek', title: 'Çek', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.cek },
];

type ImageCommandOptions = {
  src: string;
  width?: number;
  'data-image-id'?: string;
};

export default function ContractTemplateEditorModal({
  template,
  isNew,
  onClose,
  onSave,
}: ContractTemplateEditorModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [images, setImages] = useState<TemplateImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isTableActive, setIsTableActive] = useState(false);
  const [isImageActive, setIsImageActive] = useState(false);
  const [showGridlines, setShowGridlines] = useState(false);
  const [pageMargins, setPageMargins] = useState<PageMargins>(DEFAULT_PAGE_MARGINS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage,
      CustomTable.configure({
        resizable: true,
      }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      TextStyle,
      FontSize,
      LineHeight,
    ],
    content: {
      type: 'doc',
      content: [],
    },
    editable: true,
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        const isMeta = event.metaKey || event.ctrlKey;
        if (!isMeta) return false;

        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          editor.commands.undo();
          return true;
        }

        if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault();
          editor.commands.redo();
          return true;
        }

        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      const { $from } = editor.state.selection;
      let active = false;
      try {
        for (let depth = $from.depth; depth > 0; depth--) {
          const typeName = $from.node(depth).type.name;
          if (typeName === 'table' || typeName === 'tableCell' || typeName === 'tableHeader') {
            active = true;
            break;
          }
        }
        setIsTableActive(active || editor.isActive('table') || editor.can().addColumnBefore());
        setIsImageActive(editor.isActive('image') || editor.isActive('imageResize'));
      } catch {
        setIsTableActive(false);
        setIsImageActive(false);
      }
    },
    onUpdate: ({ editor }) => {
      const { $from } = editor.state.selection;
      let active = false;
      try {
        for (let depth = $from.depth; depth > 0; depth--) {
          const typeName = $from.node(depth).type.name;
          if (typeName === 'table' || typeName === 'tableCell' || typeName === 'tableHeader') {
            active = true;
            break;
          }
        }
        setIsTableActive(active || editor.isActive('table') || editor.can().addColumnBefore());
        setIsImageActive(editor.isActive('image') || editor.isActive('imageResize'));
      } catch {
        setIsTableActive(false);
        setIsImageActive(false);
      }
    },
  });

  useEffect(() => {
    if (template) {
      setTemplateName(template.TemplateName);
      setPageMargins(getPageMargins(template.Content));
      if (editor && template.Content) {
        preprocessAndSetContent(template.Content);
      }
    }
    loadImages();
  }, [template, editor]);

  const preprocessAndSetContent = async (content: any) => {
    if (!editor || !content) return;

    const clonedContent = JSON.parse(JSON.stringify(content));

    const processNodes = async (node: any) => {
      if ((node.type === 'image' || node.type === 'imageResize') && node.attrs && node.attrs.src) {
        const src = node.attrs.src;
        if (src.startsWith('image:')) {
          const imageId = src.replace('image:', '');
          try {
            const blob = await templateImageService.getByIdAsync(Number(imageId));
            const url = URL.createObjectURL(blob);
            node.attrs.src = url;
            node.attrs['data-image-id'] = imageId;
          } catch (error) {
            console.error(`Failed to load image ${imageId}:`, error);
          }
        }
      }
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          await processNodes(child);
        }
      }
    };

    await processNodes(clonedContent);
    editor.commands.setContent(clonedContent);
  };

  const loadImages = async () => {
    try {
      const imageList = await templateImageService.getAllAsync();
      setImages(imageList);
    } catch (error) {
      console.error('Load images error:', error);
      setImages([]);
    }
  };

  const insertMaterialTable = () => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${MATERIAL_TABLE_PLACEHOLDER}}}`).run();
  };

  const insertReturnTable = () => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${RETURN_TABLE_PLACEHOLDER}}}`).run();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const response = await templateImageService.uploadAsync(file);

      await loadImages();

      if (editor) {
        const { selection } = editor.state;
        if (selection && 'node' in selection) {
          editor.commands.setTextSelection(selection.to);
        }

        try {
          const blob = await templateImageService.getByIdAsync(response.ImageId);
          const url = URL.createObjectURL(blob);
          editor.chain().focus().setImage({ src: url, 'data-image-id': response.ImageId.toString(), width: 150 } as ImageCommandOptions).insertContent(' ').run();
        } catch (error) {
          console.error('Failed to load uploaded image:', error);
          editor.chain().focus().setImage({ src: `image:${response.ImageId}`, width: 150 } as ImageCommandOptions).insertContent(' ').run();
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setUploadingImage(false);
    }
  };

  const insertImage = async (imageId: number) => {
    if (!editor) return;

    const { selection } = editor.state;
    if (selection && 'node' in selection) {
      editor.commands.setTextSelection(selection.to);
    }

    try {
      const blob = await templateImageService.getByIdAsync(imageId);
      const url = URL.createObjectURL(blob);
      editor.chain().focus().setImage({ src: url, 'data-image-id': imageId.toString(), width: 150 } as ImageCommandOptions).insertContent(' ').run();
    } catch (error) {
      console.error('Failed to load image:', error);
      editor.chain().focus().setImage({ src: `image:${imageId}`, width: 150 } as ImageCommandOptions).insertContent(' ').run();
    }
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.warning('Şablon adı gereklidir');
      return;
    }

    if (!editor) return;

    try {
      setIsBusy(true);
      ensureLayoutTablesBorderless(editor);
      const clonedContent = withPageMargins(
        prepareTemplateContentForExport(editor.getJSON()),
        pageMargins
      );

      if (isNew) {
        const response = await contractTemplateService.createAsync({
          TemplateName: templateName,
          Content: clonedContent,
          IsDefault: false,
        });
        if (onSave) {
          onSave(response.TemplateId);
        }
        toast.success('Sözleşme şablonu başarıyla oluşturuldu!');
      } else if (template) {
        await contractTemplateService.updateAsync(template.TemplateId, {
          TemplateName: templateName,
          Content: clonedContent,
        });
        toast.success('Sözleşme şablonu başarıyla güncellendi!');
      }

      onClose();
    } catch (error) {
      console.error('Save template error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!editor) return;

    try {
      setIsBusy(true);
      ensureLayoutTablesBorderless(editor);
      const clonedContent = withPageMargins(
        prepareTemplateContentForExport(editor.getJSON()),
        pageMargins
      );

      const blob = await contractTemplateService.previewContentAsync(clonedContent);

      if (blob.size === 0) {
        toast.error('PDF önizlemesi oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }
      const isPdf = blob.type === 'application/pdf' || blob.type === '';
      if (!isPdf && blob.size < 10000) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          toast.error('Önizleme hatası: ' + (j.message || text.slice(0, 200)));
        } catch {
          toast.error('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)'));
        }
        return;
      }

      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Preview error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <TipTapTemplateEditorLayout
      editor={editor}
      pageTitle={isNew ? 'Yeni sözleşme şablonu' : 'Sözleşme şablonu düzenle'}
      templateName={templateName}
      onTemplateNameChange={setTemplateName}
      namePlaceholder="Örn: Standart Kiralama Sözleşmesi"
      isBusy={isBusy}
      onPreview={handlePreview}
      onSave={handleSave}
      onClose={onClose}
      pageMargins={pageMargins}
      onPageMarginsChange={setPageMargins}
      placeholderGroups={PLACEHOLDER_GROUPS}
      documentNumberKey="sozlesmeNo"
      documentNumberLabel="Sözleşme No"
      showMaterialTable
      onInsertMaterialTable={insertMaterialTable}
      showReturnTable
      onInsertReturnTable={insertReturnTable}
      images={images}
      uploadingImage={uploadingImage}
      onImageUpload={handleImageUpload}
      onInsertImage={insertImage}
      fileInputRef={fileInputRef}
      showGridlines={showGridlines}
      onToggleGridlines={() => setShowGridlines((v) => !v)}
      isTableActive={isTableActive}
      isImageActive={isImageActive}
      previewModal={
        <PdfPreviewModal
          open={showPdfPreview}
          pdfUrl={pdfPreviewUrl}
          title="Sözleşme Şablonu Önizleme"
          downloadFileName="sozlesme_sablon_onizleme.pdf"
          onClose={closePdfPreview}
        />
      }
    />
  );
}
