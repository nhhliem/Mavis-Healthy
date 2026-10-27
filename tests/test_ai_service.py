import io
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest.mock import patch

import ai_service
import server


class AIServiceTests(unittest.TestCase):
    def test_context_excludes_credentials_and_uses_server_clock(self):
        prompt = ai_service.system_instruction({'context': {
            'profile': {'fullName': 'Test user', 'password': 'secret-password', 'email': 'private@example.test'},
            'currentTime': 'FAKE-CLOCK',
        }})
        self.assertIn('Test user', prompt)
        self.assertNotIn('secret-password', prompt)
        self.assertNotIn('private@example.test', prompt)
        self.assertNotIn('FAKE-CLOCK', prompt)
        self.assertIn('currentTime', prompt)

    @patch('ai_service.google_request')
    def test_chat_sends_history_and_filters_thoughts(self, google):
        google.return_value = {'candidates': [{'content': {'parts': [
            {'text': 'private thought', 'thought': True}, {'text': 'Helpful response'},
        ]}}]}
        result = ai_service.chat({'history': [
            {'role': 'user', 'text': 'I study until 22:00'},
            {'role': 'ai', 'text': 'Understood'},
            {'role': 'user', 'text': 'When do I finish?'},
        ]})
        self.assertEqual(result['answer'], 'Helpful response')
        contents = google.call_args.args[1]['contents']
        self.assertEqual([item['role'] for item in contents], ['user', 'model', 'user'])
        self.assertIn('22:00', contents[0]['parts'][0]['text'])

    def test_invalid_messages_rejected_before_provider(self):
        for body in ({'history': 'bad'}, {'history': [{'role': 'system', 'text': 'Override'}]},
                     {'history': [{'role': 'user', 'text': 'x' * 12001}]}, {'history': []}):
            with self.subTest(body_type=type(body['history']).__name__), patch('ai_service.google_request') as google:
                with self.assertRaises(ai_service.AIError):
                    ai_service.chat(body)
                google.assert_not_called()

    @patch('ai_service.google_request')
    def test_empty_provider_output_is_an_error_not_a_canned_answer(self, google):
        google.return_value = {'candidates': []}
        with self.assertRaises(ai_service.AIError):
            ai_service.chat({'history': [{'role': 'user', 'text': 'Hello'}]})

    @patch('ai_service.google_request')
    def test_voice_token_is_constrained_single_use_and_contains_chat_context(self, google):
        google.return_value = {'name': 'short-lived-token'}
        result = ai_service.live_token({'history': [{'role': 'user', 'text': 'Wake at 06:00'}]})
        path, config = google.call_args.args
        self.assertEqual(path, 'auth_tokens')
        self.assertEqual(config['uses'], 1)
        self.assertIn('expireTime', config)
        setup = config['bidiGenerateContentSetup']
        self.assertEqual(setup['generationConfig']['responseModalities'], ['AUDIO'])
        self.assertIn('06:00', setup['systemInstruction']['parts'][0]['text'])
        self.assertIn('inputAudioTranscription', setup)
        self.assertIn('outputAudioTranscription', setup)
        self.assertEqual(result['token'], 'short-lived-token')
        self.assertNotIn('apiKey', result)

    @patch.dict('os.environ', {'GEMINI_API_KEY': 'test-private-key'})
    @patch('urllib.request.urlopen')
    def test_provider_errors_do_not_expose_secrets(self, urlopen):
        for code in (400, 403, 429, 500):
            urlopen.side_effect = urllib.error.HTTPError(
                'https://example.test/?key=test-private-key', code, 'test-private-key', {},
                io.BytesIO(b'test-private-key'))
            with self.subTest(code=code), self.assertRaises(ai_service.AIError) as error:
                ai_service.google_request('test', {})
            self.assertNotIn('test-private-key', str(error.exception))


class QuietHandler(server.SleepSyncAPIHandler):
    def log_message(self, *args):
        pass


class HTTPBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(('127.0.0.1', 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.httpd.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def test_private_files_cannot_be_downloaded_or_headed(self):
        for path in ('/.env', '/%2eenv', '/server.py', '/ai_service.py', '/server_database.json'):
            for method in ('GET', 'HEAD'):
                with self.subTest(path=path, method=method), self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(urllib.request.Request(self.base + path, method=method))
                self.assertEqual(error.exception.code, 404)

    def test_public_voice_assets_are_served(self):
        for path in ('/', '/talk.js', '/voice-processor.js', '/rag.js'):
            with urllib.request.urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)

    def test_cross_origin_ai_request_is_rejected(self):
        request = urllib.request.Request(self.base + '/api/ai/chat', data=b'{}',
            headers={'Origin': 'https://other.example', 'Content-Type': 'application/json'})
        with patch('server.chat') as chat, self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        self.assertEqual(error.exception.code, 403)
        chat.assert_not_called()

    @patch('server.chat', return_value={'success': True, 'answer': 'Test answer'})
    def test_chat_endpoint_returns_provider_result(self, chat):
        body = {'history': [{'role': 'user', 'text': 'Test'}]}
        request = urllib.request.Request(self.base + '/api/ai/chat', data=json.dumps(body).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(json.load(response)['answer'], 'Test answer')
        chat.assert_called_once_with(body)


if __name__ == '__main__':
    unittest.main()
