import { useEffect, useRef, useState, useCallback, useMemo, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { L10n, setCulture } from '@syncfusion/ej2-base';
import {
  DocumentEditorContainerComponent,
  Toolbar,
  Inject,
} from '@syncfusion/ej2-react-documenteditor';
import {
  Editor,
  Selection,
  EditorHistory,
  ContextMenu,
  OptionsPane,
  Search,
  WordExport,
  SfdtExport,
} from '@syncfusion/ej2-documenteditor';
import type { CustomToolbarItemModel, ToolbarItem } from '@syncfusion/ej2-documenteditor';
import type { ClickEventArgs } from '@syncfusion/ej2-navigations';
import { documentTemplateService } from '../services/documentTemplateService';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';
import {
  FloppyDiskIcon,
  ArrowLeftIcon,
  DownloadIcon,
  TableIcon,
  InfoIcon,
  CaretDownIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  SidebarIcon,
} from '@phosphor-icons/react';
import { useHeaderActions } from '../layouts/HeaderActionsContext';
import {
  DOCUMENT_TEMPLATE_PLACEHOLDERS,
  MATERIAL_TABLE_PLACEHOLDER,
  type DocumentPlaceholder,
} from '../constants/documentTemplatePlaceholders';
import syncfusionTr from '../locales/syncfusion-tr.json';

import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-react-documenteditor/styles/material.css';

L10n.load({ tr: syncfusionTr });
setCulture('tr');

const TOOLBAR_IMAGE_ID = 'tpl-insert-image';
const TOOLBAR_TABLE_ID = 'tpl-insert-table';
const TOOLBAR_HEADER_ID = 'tpl-goto-header';
const TOOLBAR_FOOTER_ID = 'tpl-goto-footer';

type PlaceholderGroup = {
  id: string;
  title: string;
  items: DocumentPlaceholder[];
};

const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  { id: 'musteri', title: 'Müşteri', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.musteri },
  { id: 'santiye', title: 'Şantiye', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.santiye },
  { id: 'teklif', title: 'Teklif', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.teklif },
  { id: 'sozlesme', title: 'Sözleşme', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.sozlesme },
  { id: 'cek', title: 'Çek', items: DOCUMENT_TEMPLATE_PLACEHOLDERS.cek },
];

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<DocumentEditorContainerComponent>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingSfdtRef = useRef<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    musteri: true,
    santiye: true,
    teklif: false,
    sozlesme: false,
    cek: false,
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fieldSearch, setFieldSearch] = useState('');
  const { setActions } = useHeaderActions();
  const isNewTemplate = !id;

  useEffect(() => {
    setActions(null);
    return () => setActions(null);
  }, [setActions]);

  const toolbarItems = useMemo<(CustomToolbarItemModel | ToolbarItem)[]>(
    () => [
      'Undo',
      'Redo',
      'Separator',
      {
        id: TOOLBAR_IMAGE_ID,
        text: 'Görsel',
        tooltipText: 'Bilgisayardan görsel ekle',
        prefixIcon: 'e-icons e-image',
      },
      {
        id: TOOLBAR_TABLE_ID,
        text: 'Tablo',
        tooltipText: '3x3 tablo ekle',
        prefixIcon: 'e-icons e-table',
      },
      'Separator',
      {
        id: TOOLBAR_HEADER_ID,
        text: 'Üstbilgi',
        tooltipText: 'Üstbilgiyi düzenle',
        prefixIcon: 'e-icons e-header',
      },
      {
        id: TOOLBAR_FOOTER_ID,
        text: 'Altbilgi',
        tooltipText: 'Altbilgiyi düzenle',
        prefixIcon: 'e-icons e-footer',
      },
      'PageNumber',
      'PageSetup',
      'Break',
      'Separator',
      'Find',
    ],
    []
  );

  const openPendingSfdt = useCallback(() => {
    const sfdt = pendingSfdtRef.current;
    const editor = editorRef.current?.documentEditor;
    if (!sfdt || !editor) return;
    editor.open(sfdt);
    pendingSfdtRef.current = null;
  }, []);

  useEffect(() => {
    const loadTemplate = async () => {
      if (!id) {
        pendingSfdtRef.current = null;
        setLoading(false);
        setTemplateName('Yeni Şablon');
        return;
      }

      try {
        setLoading(true);
        const template = await documentTemplateService.getByIdAsync(Number(id));
        setTemplateName(template.name);
        pendingSfdtRef.current = template.sfdt;
        if (editorRef.current?.documentEditor) {
          openPendingSfdt();
        }
      } catch (error) {
        console.error('Şablon yüklenirken hata:', error);
        toast.error(getApiErrorMessage(error) || 'Şablon yüklenemedi');
        navigate('/document-templates');
      } finally {
        setLoading(false);
      }
    };

    void loadTemplate();
  }, [id, navigate, openPendingSfdt]);

  const handleEditorCreated = useCallback(() => {
    const container = editorRef.current;
    if (container?.documentEditor) {
      container.documentEditor.layoutType = 'Pages';
      container.documentEditor.pageOutline = '#e5e7eb';
    }
    openPendingSfdt();
  }, [openPendingSfdt]);

  const getDocumentEditor = useCallback(() => {
    return editorRef.current?.documentEditor ?? null;
  }, []);

  const insertPlaceholder = useCallback(
    (key: string) => {
      const editor = getDocumentEditor();
      if (!editor) {
        toast.error('Editör hazır değil');
        return;
      }
      editor.editor.insertText(`{{${key}}}`);
      editor.focusIn();
    },
    [getDocumentEditor]
  );

  const insertMaterialTablePlaceholder = useCallback(() => {
    insertPlaceholder(MATERIAL_TABLE_PLACEHOLDER);
  }, [insertPlaceholder]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const filteredGroups = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return PLACEHOLDER_GROUPS;
    return PLACEHOLDER_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)
      ),
    })).filter((group) => group.items.length > 0);
  }, [fieldSearch]);

  const insertImageFromFile = useCallback(
    (file: File) => {
      const editor = getDocumentEditor();
      if (!editor) {
        toast.error('Editör hazır değil');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result;
        if (typeof base64 !== 'string') {
          toast.error('Görsel okunamadı');
          return;
        }
        const image = new Image();
        image.onload = () => {
          const maxWidth = 400;
          const scale = image.width > maxWidth ? maxWidth / image.width : 1;
          editor.editor.insertImage(base64, image.width * scale, image.height * scale);
          editor.focusIn();
        };
        image.onerror = () => toast.error('Görsel yüklenemedi');
        image.src = base64;
      };
      reader.onerror = () => toast.error('Görsel okunamadı');
      reader.readAsDataURL(file);
    },
    [getDocumentEditor]
  );

  const handleImageInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        insertImageFromFile(file);
      }
      e.target.value = '';
    },
    [insertImageFromFile]
  );

  const handleToolbarClick = useCallback(
    (args: ClickEventArgs) => {
      const itemId = args.item?.id;
      const editor = getDocumentEditor();
      if (!editor || !itemId) return;

      switch (itemId) {
        case TOOLBAR_IMAGE_ID:
          imageInputRef.current?.click();
          break;
        case TOOLBAR_TABLE_ID:
          editor.editor.insertTable(3, 3);
          editor.focusIn();
          break;
        case TOOLBAR_HEADER_ID:
          editor.selection.goToHeader();
          editor.focusIn();
          break;
        case TOOLBAR_FOOTER_ID:
          editor.selection.goToFooter();
          editor.focusIn();
          break;
        default:
          break;
      }
    },
    [getDocumentEditor]
  );

  const handleSave = useCallback(async () => {
    if (!editorRef.current?.documentEditor) {
      toast.error('Editör hazır değil');
      return;
    }

    try {
      setSaving(true);
      const sfdt = editorRef.current.documentEditor.serialize();

      if (isNewTemplate) {
        const name = templateName.trim() || 'İsimsiz Şablon';
        const result = await documentTemplateService.createAsync({ name, sfdt });
        toast.success('Şablon oluşturuldu');
        navigate(`/document-templates/${result.id}/edit`, { replace: true });
      } else {
        await documentTemplateService.updateAsync(Number(id), sfdt);
        toast.success('Şablon kaydedildi');
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Şablon kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }, [id, isNewTemplate, templateName, navigate]);

  const handleExportWord = useCallback(async () => {
    if (isNewTemplate) {
      toast.error('Önce şablonu kaydetmelisiniz');
      return;
    }

    if (!window.electron) {
      toast.error('Electron API bulunamadı');
      return;
    }

    try {
      const blob = await documentTemplateService.exportDocxAsync(Number(id));

      if (blob.size === 0) {
        toast.error('Export edilemedi (sunucu boş yanıt döndü)');
        return;
      }

      const defaultFileName = `${templateName || 'sablon'}.docx`;
      const filePath = await window.electron.saveFile({
        defaultPath: defaultFileName,
        filters: [{ name: 'Word Belgesi', extensions: ['docx'] }],
      });

      if (!filePath) {
        return;
      }

      const arrayBuffer = await blob.arrayBuffer();
      await window.electron.writeFile(filePath, arrayBuffer);
      toast.success('Dosya kaydedildi');
    } catch (error) {
      console.error('Export hatası:', error);
      toast.error(getApiErrorMessage(error) || 'Export edilemedi');
    }
  }, [id, isNewTemplate, templateName]);

  const handleBack = useCallback(() => {
    navigate('/document-templates');
  }, [navigate]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-background-main flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background-main">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageInputChange}
      />

      <header className="shrink-0 border-b border-background-border bg-background-panel/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-hover hover:text-text-primary"
          >
            <ArrowLeftIcon size={16} />
            <span className="hidden sm:inline">Geri</span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {isNewTemplate ? 'Yeni belge şablonu' : 'Şablon düzenle'}
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full max-w-xl border-0 bg-transparent py-0.5 text-sm font-semibold text-text-primary outline-none placeholder:text-text-secondary/70 focus:ring-0"
              placeholder="Şablon adını yazın…"
              aria-label="Şablon adı"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className={[
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                sidebarOpen
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-background-border bg-background-panel text-text-secondary hover:bg-background-hover',
              ].join(' ')}
              title={sidebarOpen ? 'Alan panelini gizle' : 'Alan panelini göster'}
            >
              <SidebarIcon size={16} />
              <span className="hidden md:inline">Alanlar</span>
            </button>
            {!isNewTemplate && (
              <button
                type="button"
                onClick={handleExportWord}
                className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-1.5"
              >
                <DownloadIcon size={16} />
                Word
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary !py-2 !px-4 text-xs flex items-center gap-1.5"
            >
              <FloppyDiskIcon size={16} />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="template-editor-fields flex w-[280px] shrink-0 flex-col border-r border-background-border bg-background-panel">
            <div className="border-b border-background-border px-4 pb-3 pt-4">
              <h3 className="text-sm font-semibold text-text-primary">Dinamik alanlar</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                İmleci belgede istediğiniz yere koyun, ardından bir alana tıklayın.
              </p>
              <div className="relative mt-3">
                <MagnifyingGlassIcon
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                />
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Alan ara…"
                  className="input w-full !py-1.5 !pl-8 !pr-3 text-xs"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              <button
                type="button"
                onClick={insertMaterialTablePlaceholder}
                className="flex w-full items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <TableIcon size={16} weight="duotone" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-text-primary">Malzeme tablosu</span>
                  <span className="block truncate font-mono text-[10px] text-text-secondary">
                    {`{{${MATERIAL_TABLE_PLACEHOLDER}}}`}
                  </span>
                </span>
              </button>

              {filteredGroups.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-text-secondary">
                  Eşleşen alan bulunamadı
                </p>
              )}

              {filteredGroups.map((group) => {
                const isOpen = fieldSearch ? true : openGroups[group.id];
                return (
                  <div
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-background-border bg-background-surface"
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-hover"
                    >
                      <span className="text-xs font-semibold text-text-primary">{group.title}</span>
                      <span className="flex items-center gap-1.5 text-text-secondary">
                        <span className="text-[10px] tabular-nums">{group.items.length}</span>
                        {isOpen ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="space-y-0.5 border-t border-background-border px-1.5 py-1.5">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => insertPlaceholder(item.key)}
                            className="group/field w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-background-hover"
                            title={`{{${item.key}}} ekle`}
                          >
                            <span className="block text-xs text-text-primary group-hover/field:text-primary">
                              {item.label}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-text-secondary opacity-70">
                              {`{{${item.key}}}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-background-border bg-background-surface px-3 py-3">
              <div className="flex gap-2 text-[10px] leading-relaxed text-text-secondary">
                <InfoIcon size={14} className="mt-0.5 shrink-0 text-info" />
                <p>
                  Tablo seçildiğinde satır/sütun araçları sağ panelde çıkar. Üstbilgi/Altbilgi için
                  araç çubuğunu kullanın; gövdeye dönmek için Escape.
                </p>
              </div>
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex-1 min-h-0 template-editor-sf-wrap template-editor-sf-fullscreen">
            <DocumentEditorContainerComponent
              ref={editorRef}
              enableToolbar={true}
              height="100%"
              serviceUrl=""
              locale="tr"
              layoutType="Pages"
              showPropertiesPane={true}
              toolbarItems={toolbarItems}
              toolbarClick={handleToolbarClick}
              created={handleEditorCreated}
            >
              <Inject
                services={[
                  Toolbar,
                  Editor,
                  Selection,
                  EditorHistory,
                  ContextMenu,
                  OptionsPane,
                  Search,
                  WordExport,
                  SfdtExport,
                ]}
              />
            </DocumentEditorContainerComponent>
          </div>
        </div>
      </div>
    </div>
  );
}
