import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DocumentEditorContainerComponent,
  Toolbar,
  Inject,
} from '@syncfusion/ej2-react-documenteditor';
import {
  // KRİTİK: Bu modüller olmadan editör çalışmaz
  Editor,
  Selection,
  EditorHistory,
  ContextMenu,
  OptionsPane,
  Search,
  WordExport,
  SfdtExport,
} from '@syncfusion/ej2-documenteditor';
import { documentTemplateService } from '../services/documentTemplateService';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';
import { FloppyDiskIcon, ArrowLeftIcon, DownloadIcon } from '@phosphor-icons/react';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

// Syncfusion stilleri
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-react-documenteditor/styles/material.css';

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<DocumentEditorContainerComponent>(null);
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { setActions } = useHeaderActions();
  const isNewTemplate = !id;

  useEffect(() => {
    const loadTemplate = async () => {
      if (!id) {
        // Yeni şablon - boş editör
        setLoading(false);
        setTemplateName('Yeni Şablon');
        return;
      }

      try {
        setLoading(true);
        const template = await documentTemplateService.getByIdAsync(Number(id));
        setTemplateName(template.name);
        
        // SFDT içeriğini editöre yükle
        if (editorRef.current?.documentEditor) {
          editorRef.current.documentEditor.open(template.sfdt);
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
  }, [id, navigate]);

  const handleSave = useCallback(async () => {
    if (!editorRef.current?.documentEditor) {
      toast.error('Editör hazır değil');
      return;
    }

    try {
      setSaving(true);
      const sfdt = editorRef.current.documentEditor.serialize();

      if (isNewTemplate) {
        // Yeni şablon oluştur
        const name = templateName || 'İsimsiz Şablon';
        const result = await documentTemplateService.createAsync({ name, sfdt });
        toast.success('Şablon oluşturuldu');
        // Yeni oluşturulan şablonun düzenleme sayfasına yönlendir
        navigate(`/document-templates/${result.id}/edit`, { replace: true });
      } else {
        // Mevcut şablonu güncelle
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

      // Electron save dialog kullan
      const defaultFileName = `${templateName || 'sablon'}.docx`;
      const filePath = await window.electron.saveFile({
        defaultPath: defaultFileName,
        filters: [{ name: 'Word Belgesi', extensions: ['docx'] }],
      });

      if (!filePath) {
        // Kullanıcı iptal etti
        return;
      }

      // Blob'u ArrayBuffer'a çevir
      const arrayBuffer = await blob.arrayBuffer();
      
      // Electron IPC ile dosyayı kaydet
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

  useEffect(() => {
    setActions(
      <>
        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <ArrowLeftIcon size={16} />
          Geri
        </button>
        {!isNewTemplate && (
          <button
            type="button"
            onClick={handleExportWord}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <DownloadIcon size={16} />
            Word İndir
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <FloppyDiskIcon size={16} />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, handleBack, handleSave, handleExportWord, saving, isNewTemplate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)]">
      <DocumentEditorContainerComponent
        ref={editorRef}
        enableToolbar={true}
        height="100%"
        serviceUrl=""
      >
        <Inject
          services={[
            Toolbar,
            Editor,           // Temel metin düzenleme
            Selection,        // Metin seçimi
            EditorHistory,    // Undo/Redo
            ContextMenu,      // Sağ tık menüsü
            OptionsPane,      // Sağ panel (ayarlar, arama)
            Search,           // Bul/Değiştir
            WordExport,       // Word export
            SfdtExport,       // SFDT string export (serialize() için)
          ]}
        />
      </DocumentEditorContainerComponent>
    </div>
  );
}
