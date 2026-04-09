"""
Extractor de contenido web.
Dado una URL, descarga la página y extrae el texto limpio y las imágenes.
No requiere dependencias externas — usa solo la librería estándar de Python.
"""

import re
import urllib.request
import urllib.error
from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    """Parser HTML que extrae solo el texto visible."""

    SKIP_TAGS = {"script", "style", "noscript", "head", "meta", "link"}

    def __init__(self):
        super().__init__()
        self._skip    = False
        self._texts   = []
        self.images   = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip = True

        if tag == "img":
            attrs_dict = dict(attrs)
            src = attrs_dict.get("src", "")
            if src.startswith("http"):
                self.images.append(src)

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS:
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            cleaned = data.strip()
            if cleaned:
                self._texts.append(cleaned)

    def get_text(self) -> str:
        return " ".join(self._texts)


def scrape_url(url: str, timeout: int = 10) -> dict:
    """
    Descarga y extrae el contenido de una URL.

    Returns:
        {
            "success": bool,
            "text": str,
            "images": list[str],
            "error": str | None,
        }
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; TruthLens/1.0; "
            "+https://github.com/truthlens)"
        )
    }

    try:
        req      = urllib.request.Request(url, headers=headers)
        response = urllib.request.urlopen(req, timeout=timeout)

        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            return {
                "success": False,
                "text":    "",
                "images":  [],
                "error":   f"Tipo de contenido no soportado: {content_type}",
            }

        html = response.read().decode("utf-8", errors="ignore")

        parser = _TextExtractor()
        parser.feed(html)

        text   = parser.get_text()
        images = parser.images[:10]  # máximo 10 imágenes

        # Limpiar espacios múltiples
        text = re.sub(r"\s{2,}", " ", text).strip()

        return {
            "success": True,
            "text":    text[:8000],  # máximo 8000 caracteres para Comprehend
            "images":  images,
            "error":   None,
        }

    except urllib.error.HTTPError as e:
        return {"success": False, "text": "", "images": [], "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"success": False, "text": "", "images": [], "error": str(e.reason)}
    except Exception as e:
        return {"success": False, "text": "", "images": [], "error": str(e)}
