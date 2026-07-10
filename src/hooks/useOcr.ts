import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useOcr() {
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrImageUrl, setOcrImageUrl] = useState<string | null>(null);
  const [ocrRunId, setOcrRunId] = useState(0);
  const imageUrlRef = useRef<string | null>(null);

  const runOcr = useCallback(async (file?: File) => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    const url = file ? URL.createObjectURL(file) : null;
    imageUrlRef.current = url;
    setOcrImageUrl(url);
    setOcrRunId((id) => id + 1);
    setOcrLoading(true);
    setOcrError(null);
    setOcrText(null);
    try {
      const text = await invoke<string>("ocr_from_clipboard");
      setOcrText(text);
    } catch (e) {
      setOcrError(String(e));
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const clearOcr = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setOcrImageUrl(null);
    setOcrText(null);
    setOcrError(null);
    setOcrLoading(false);
  }, []);

  return {
    ocrText,
    setOcrText,
    ocrLoading,
    ocrError,
    ocrImageUrl,
    ocrRunId,
    runOcr,
    clearOcr,
  };
}
