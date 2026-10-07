#!/bin/bash
# Сборка APK «Слесарь ЦТП» без Gradle: aapt2 + javac + d8 + apksigner.
# Нужен Android SDK (build-tools 34, platform android-34) и JDK 17+.
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-/opt/android}
BT=$SDK/build-tools/34.0.0
JAR=$SDK/platforms/android-34/android.jar
OUT=build
APK=dist/SlesarSim.apk
VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}

rm -rf $OUT && mkdir -p $OUT/gen $OUT/classes $OUT/dex dist
[ -f android/res/mipmap-mdpi/ic_launcher.png ] || python3 tools/make_icons.py android/res

$BT/aapt2 compile --dir android/res -o $OUT/res.zip
$BT/aapt2 link -o $OUT/base.apk -I $JAR --manifest android/AndroidManifest.xml \
  --java $OUT/gen -A web --min-sdk-version 21 --target-sdk-version 34 \
  --version-code $VERSION_CODE --version-name $VERSION_NAME $OUT/res.zip

javac -nowarn --release 8 -Xlint:-options -cp $JAR -d $OUT/classes $(find android/src $OUT/gen -name '*.java')
$BT/d8 --release --min-api 21 --lib $JAR --output $OUT/dex $(find $OUT/classes -name '*.class')

cp $OUT/base.apk $OUT/unsigned.apk
(cd $OUT/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
$BT/apksigner sign --ks android/slesarsim.keystore --ks-pass pass:android --key-pass pass:android \
  --out $APK $OUT/aligned.apk
$BT/apksigner verify $APK
rm -f $APK.idsig
echo "APK: $APK ($(du -h $APK | cut -f1))"
