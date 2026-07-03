import PublicStoreClient from "./PublicStoreClient";

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function generateMetadata({ params }: Props) {
  try {
    // Handle both Promise and synchronous params representation safely
    const resolvedParams = params instanceof Promise ? await params : params;
    const slug = resolvedParams?.slug;

    if (!slug) {
      return {
        title: {
          absolute: "Tienda",
        },
        icons: {
          icon: "/favicon.ico",
        },
      };
    }

    const res = await fetch(`${API_URL}/public/${slug}/items`, {
      next: { revalidate: 60 }, // Cache metadata for 60 seconds
    });

    if (!res.ok) {
      return {
        title: {
          absolute: "Tienda",
        },
        icons: {
          icon: "/favicon.ico",
        },
      };
    }

    const data = await res.json();
    const nombreNegocio = data?.business?.name;
    const logoUrl = data?.business?.logoUrl;

    return {
      title: {
        absolute: nombreNegocio || "Tienda",
      },
      icons: {
        icon: logoUrl || "/favicon.ico",
      },
    };
  } catch (error) {
    console.error("Error generating metadata for tienda page:", error);
    return {
      title: {
        absolute: "Tienda",
      },
      icons: {
        icon: "/favicon.ico",
      },
    };
  }
}

export default function Page() {
  return <PublicStoreClient />;
}
