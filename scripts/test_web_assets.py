import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from web_assets import prepare_web_assets, complete_module_dependencies, module_references


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

    def test_restore_raw_worker_and_recursive_siblings(self):
        distribution = self.root / 'dist'
        distribution.mkdir()
        package = self.root / 'node_modules/vendor/dist'
        package.mkdir(parents=True)
        worker = 'import{run}from"./shared.mjs";run();'
        (distribution / 'worker-hash.mjs').write_text(worker)
        (package / 'worker.mjs').write_text(worker)
        (package / 'shared.mjs').write_text('export{run}from"./nested/core.mjs";')
        (package / 'nested').mkdir()
        (package / 'nested/core.mjs').write_text('export function run() {}')
        copied = complete_module_dependencies(self.root, distribution)
        self.assertEqual(set(copied), {'shared.mjs', 'nested/core.mjs'})
        self.assertTrue((distribution / 'nested/core.mjs').is_file())

    def test_missing_dependency_fails_before_packaging(self):
        with self.assertRaisesRegex(ValueError, 'Módulo incompleto'):
            self.prepare({'index.html': 'ok', 'assets/worker.mjs': 'import{run}from"./missing.mjs";'})
        self.assertFalse((self.root / 'www').exists())

    def test_same_basename_is_not_enough_to_copy_dependency(self):
        distribution = self.root / 'dist'
        distribution.mkdir()
        package = self.root / 'node_modules/unrelated'
        package.mkdir(parents=True)
        (distribution / 'worker.mjs').write_text('import "./shared.mjs";')
        (package / 'shared.mjs').write_text('unrelated')
        with self.assertRaisesRegex(ValueError, 'Módulo incompleto'):
            complete_module_dependencies(self.root, distribution)

    def test_complete_modules_are_unchanged(self):
        web = self.prepare({'index.html': 'ok', 'assets/worker.mjs': 'import "./shared.mjs";',
                            'assets/shared.mjs': 'export const ready = true;'})
        self.assertEqual((web / 'assets/shared.mjs').read_text(), 'export const ready = true;')

    def test_import_detection_ignores_documentation_and_comments(self):
        code = '''// import "./comment.js";
        const example = 'import "./example.js";';
        const template = `import "./template.js";`;
        /* export{a}from"./comment2.mjs"; */
        import{a}from"./real.mjs";
        export{b}from'./other.mjs';
        import('./dynamic.mjs');'''
        self.assertEqual(list(module_references(code)), ['./real.mjs', './other.mjs', './dynamic.mjs'])


if __name__ == '__main__':
    unittest.main()
