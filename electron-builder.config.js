export default {
  appId: 'com.iskeletakip.desktop',
  productName: 'İskeleTakip',
  directories: {
    output: 'release',
  },
  files: ['dist/**/*', 'dist-electron/**/*', 'package.json'],
  win: {
    target: ['nsis'],
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};

