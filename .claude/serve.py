# 開発用サーバー：ブラウザにキャッシュさせず、常に最新のファイルを返す
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.test(HandlerClass=NoCacheHandler, port=8000, bind='127.0.0.1')
