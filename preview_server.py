"""Temporary external Chat/Voice preview; excludes account/admin/database APIs."""
import os
from http.server import ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from server import SleepSyncAPIHandler


class PreviewHandler(SleepSyncAPIHandler):
    def send_head(self):
        from pathlib import Path
        if Path(self.translate_path(self.path)).name == 'admin.html':
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        if unquote(urlsplit(self.path).path).startswith('/api/'):
            self.send_json({'success': False, 'error': 'Bản test không mở dữ liệu quản trị.'}, 404)
            return
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path in ('/api/ai/chat', '/api/ai/live-token'):
            self.handle_ai(path)
        elif path == '/api/sync':
            # Keep the preview's browser data local. Never read/write the real DB.
            self.send_json({'success': False, 'preview': True})
        else:
            self.send_json({'success': False, 'error': 'Bản test chỉ mở tính năng Chat và Voice.'}, 403)


if __name__ == '__main__':
    port = int(os.environ.get('PREVIEW_PORT', '8767'))
    with ThreadingHTTPServer(('127.0.0.1', port), PreviewHandler) as httpd:
        print(f'Chat/Voice preview: http://127.0.0.1:{port}', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
