import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 });
    }

    // Validar tamaño (2MB)
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el límite de 2MB' }, { status: 400 });
    }

    // Validar tipo MIME
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido. Solo JPEG, PNG, WEBP y GIF.' }, { status: 400 });
    }

    const safeName = file.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._-]/g, '');

    const pathname = `items/${safeName}`;

    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch (error) {

    console.error('Blob upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const { del } = await import('@vercel/blob');
    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blob delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}

