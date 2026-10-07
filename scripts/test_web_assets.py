import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from web_assets import prepare_web_assets


class WebAssetsTests(unittest.TestCase):
    def prepare(self, files, build=True):
        archive = self.root / 'source.zip'
        with zipfile.ZipFile(archive, 'w') as output:
            for name, content in files.items():
                output.writestr(name, content)
        prepare_web_assets(archive, self.root / 'www', build=build)
        return self.root / 'www'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_nested_dist_keeps_json_and_worker(self):
        web = self.prepare({'map/dist/index.html': '<html></html>',
                            'map/dist/pontos.json': '[{"lat":1}]',
                            'map/dist/assets/worker.js': 'self.onmessage = () => {}',
                            'map/.sheet2apk/splash.json': '{}'})
        self.assertEqual(json.loads((web / 'pontos.json').read_text()), [{'lat': 1}])
        self.assertTrue((web / 'assets/worker.js').is_file())
        self.assertTrue((web / '.sheet2apk/splash.json').is_file())

    def test_static_files_and_old_destination(self):
        (self.root / 'www').mkdir()
        (self.root / 'www/old.js').write_text('obsolete')
        web = self.prepare({'index.html': '<html></html>', 'data/stops.geojson': '{}'})
        self.assertFalse((web / 'old.js').exists())
        self.assertTrue((web / 'data/stops.geojson').exists())

    def test_build_replaces_stale_distribution(self):
        def npm(command, cwd, check):
            if command[-1] == 'build':
                self.assertFalse((cwd / 'dist').exists())
                (cwd / 'dist').mkdir()
                (cwd / 'dist/index.html').write_text('fresh')
                (cwd / 'dist/data.json').write_text('[1,2]')
        with patch('web_assets.shutil.which', return_value='npm'), patch('web_assets.subprocess.run', side_effect=npm) as run:
            web = self.prepare({'package.json': '{"scripts":{"build":"vite build"}}',
                                'index.html': '<script src="/src/main.js"></script>',
                                'dist/index.html': 'stale'})
        self.assertEqual((web / 'index.html').read_text(), 'fresh')
        self.assertEqual(run.call_count, 2)

    def test_build_failure_does_not_package_old_dist(self):
        with patch('web_assets.shutil.which', return_value='npm'), patch('web_assets.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'npm')):
            with self.assertRaises(subprocess.CalledProcessError):
                self.prepare({'package.json': '{"scripts":{"build":"vite build"}}', 'dist/index.html': 'stale'})
        self.assertFalse((self.root / 'www').exists())

    def test_custom_output(self):
        web = self.prepare({'.sheet2apk/config.json': '{"web_dir":"site"}', 'site/index.html': 'custom'})
        self.assertEqual((web / 'index.html').read_text(), 'custom')

    def test_reject_zip_traversal(self):
        with self.assertRaises(ValueError):
            self.prepare({'../outside.txt': 'bad', 'index.html': 'ok'})

    def test_reject_development_html(self):
        with self.assertRaises(ValueError):
            self.prepare({'index.html': '<script src="/src/main.js"></script>'})


if __name__ == '__main__':
    unittest.main()
