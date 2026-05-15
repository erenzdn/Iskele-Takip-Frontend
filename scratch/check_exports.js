import pkg from 'electron-updater';
console.log('Keys of pkg:', Object.keys(pkg));
console.log('Is autoUpdater in pkg?', 'autoUpdater' in pkg);
if (pkg.autoUpdater) {
    console.log('autoUpdater is present');
} else if (pkg.default && pkg.default.autoUpdater) {
    console.log('autoUpdater is in pkg.default');
} else {
    console.log('autoUpdater not found in pkg or pkg.default');
}
