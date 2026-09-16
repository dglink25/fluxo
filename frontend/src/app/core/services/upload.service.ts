import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadResult {
  url: string;
  publicId: string;
  originalFilename: string;
  format: string;
  bytes: number;
  resourceType: string;
}

/**
 * Service d'upload de fichiers vers Cloudinary.
 *
 * Utilise fetch() natif (PAS HttpClient) pour éviter que l'intercepteur
 * d'authentification Fluxo n'ajoute un header Authorization aux requêtes
 * Cloudinary — ce qui causerait un rejet ou un timeout.
 *
 * Fallback automatique en dataURL si Cloudinary n'est pas configuré (dev local).
 */
@Injectable({ providedIn: 'root' })
export class UploadService {

  private get cloudName()    { return environment.cloudinaryCloudName    ?? ''; }
  private get uploadPreset() { return environment.cloudinaryUploadPreset ?? ''; }
  private get isConfigured() { return !!this.cloudName && !!this.uploadPreset; }

  upload(file: File): Observable<UploadResult> {
    if (this.isConfigured) {
      return from(this.uploadToCloudinary(file));
    }
    console.warn(
      '[UploadService] Cloudinary non configuré — fallback dataURL.\n' +
      'Fichiers non visibles par les autres membres.'
    );
    return from(this.readAsDataUrl(file));
  }

  // ── Upload Cloudinary via fetch() natif ──────────────────────────────────

  private async uploadToCloudinary(file: File): Promise<UploadResult> {
    // Utiliser "auto" pour que Cloudinary détecte et gère tous les types de fichiers
    // en accès public — évite le problème d'ACL sur /raw/upload
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('resource_type', 'auto');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 120_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        body:   formData,
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error('Upload annulé (timeout 120s). Vérifiez votre connexion ou réduisez la taille du fichier.');
      }
      throw new Error(`Erreur réseau lors de l'upload : ${err?.message ?? 'inconnue'}`);
    }
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Cloudinary error: ${msg}`);
    }

    return {
      url:              data.secure_url,
      publicId:         data.public_id,
      originalFilename: data.original_filename ?? file.name,
      format:           data.format ?? file.name.split('.').pop() ?? '',
      bytes:            data.bytes ?? file.size,
      resourceType:     data.resource_type ?? 'auto',
    };
  }

  // ── Fallback dataURL (dev sans Cloudinary) ───────────────────────────────

  private readAsDataUrl(file: File): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve({
        url:              e.target?.result as string,
        publicId:         '',
        originalFilename: file.name,
        format:           file.name.split('.').pop() ?? '',
        bytes:            file.size,
        resourceType:     'raw',
      });
      reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
      reader.readAsDataURL(file);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Cloudinary distingue 3 resource_types :
   * - image : jpg, png, gif, webp, svg...
   * - video : mp4, webm, mov... + audio (mp3, wav...)
   * - raw   : tout le reste (PDF, Word, Excel, ZIP...)
   */
  private getResourceType(file: File): 'image' | 'video' | 'raw' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return 'video';
    return 'raw';
  }
}
