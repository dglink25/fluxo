import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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
 * Service d'upload de fichiers.
 *
 * Stratégie :
 * - Si Cloudinary est configuré (cloudinaryCloudName + cloudinaryUploadPreset) :
 *   upload direct vers Cloudinary depuis le navigateur (non signé).
 *   → URL permanente, partageable, accessible par tous les membres.
 *
 * - Sinon (dev local sans config) :
 *   lecture en dataURL (base64) + avertissement dans la console.
 *   Les fichiers ne seront visibles que pendant la session courante.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private get cloudName()    { return environment.cloudinaryCloudName; }
  private get uploadPreset() { return environment.cloudinaryUploadPreset; }
  private get isConfigured() { return !!this.cloudName && !!this.uploadPreset; }

  constructor(private http: HttpClient) {}

  /**
   * Upload un fichier et retourne une URL permanente.
   * Supporte : images, vidéos, audio, PDF, documents, archives.
   */
  upload(file: File): Observable<UploadResult> {
    if (this.isConfigured) {
      return this.uploadToCloudinary(file);
    }
    // Fallback dev — dataURL (visible uniquement pour le déposeur pendant la session)
    console.warn(
      '[UploadService] Cloudinary non configuré.\n' +
      'Les fichiers sont stockés en base64 et ne seront pas visibles par les autres membres.\n' +
      'Configurez CLOUDINARY_CLOUD_NAME et CLOUDINARY_UPLOAD_PRESET dans environment.ts.'
    );
    return this.readAsDataUrl(file);
  }

  private uploadToCloudinary(file: File): Observable<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', 'fluxo');

    // Cloudinary détecte automatiquement le resource_type
    // Pour les non-images (PDF, docs, etc.) il faut utiliser /raw/upload
    const resourceType = this.getResourceType(file);
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`;

    return this.http.post<any>(url, formData).pipe(
      map((res) => ({
        url:              res.secure_url,
        publicId:         res.public_id,
        originalFilename: res.original_filename,
        format:           res.format,
        bytes:            res.bytes,
        resourceType:     res.resource_type,
      })),
    );
  }

  private readAsDataUrl(file: File): Observable<UploadResult> {
    return from(
      new Promise<UploadResult>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve({
          url:              e.target?.result as string,
          publicId:         '',
          originalFilename: file.name,
          format:           file.name.split('.').pop() ?? '',
          bytes:            file.size,
          resourceType:     'raw',
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    );
  }

  private getResourceType(file: File): 'image' | 'video' | 'raw' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return 'video';
    return 'raw'; // PDF, Word, Excel, ZIP, etc.
  }
}
