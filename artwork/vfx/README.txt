VFX 素材と実装記録
2026年11月26日

SpriteCanvas Effects
公式 https://spritecanvas.com/free-sprite-sheets/effects/
取得 https://spritecanvas.com/free/effects.zip
CC0 1.0。配布ZIP内のLICENSE.txtとREADME.txtをこのフォルダへ保存。
6種類の透過PNG連番シートを、元の6フレームの矩形を維持したWebPへ変換。
原本JSONも保存。AI生成後にフレームを整えた素材であることが配布元に記載されている。

Kenney Particle Pack
公式 https://kenney.nl/assets/particle-pack
作者による別配布 https://opengameart.org/content/particle-pack-80-sprites
取得 https://opengameart.org/sites/default/files/kenney_particlePack.zip
CC0。配布ZIP内のLicense.txtをkenney-LICENSE.txtとして保存。
circle_02、light_03、star_06、twirl_02の4点のみ使用。
白黒の加算合成用マスクを輝度から透過へ変換し、256pxの白い粒子へ最適化。描画時に金・キャラ色へ着色する。

配信用素材10点の合計は約0.60MiB。出典、原本SHA-256、配信物SHA-256はmanifest.jsonに記録。
有料素材、再配布制限付きの素材は使用していない。
金の二重召喚陣の円・幾何学紋様・光柱・衝撃波、各攻撃の軌道は本プロジェクトのCanvas描画。

描画の入口
apps/web/battle-vfx.js：描画、アンカー追従、描画終了、切り替え時の破棄。
apps/web/legendary-attacks.js：80件のレジェンドunit定義への個別設定。非戦闘用の願いの選択肢4件も元データ上はunitなので含む。
実際に場に出るユニットと変身後の姿には、カードの名前・姿・能力に合う系統と色を指定。
25系統の描画に、個別の配色・紋章・位相・粒子数を組み合わせる。80本の別動画を配信する方式ではない。
攻撃できないカードを攻撃可能にしたり、攻撃回数・ダメージ・対象・能力を変更したりしない。
レジェンド武器は現在のカタログには存在しない。黒薔薇へのリーダー変身は専用の茨系演出を使う。

通常攻撃は短い斬撃と火花。大型召喚とレジェンド召喚は光量・粒子・時間を段階分けする。
レジェンド召喚は標準で中央表示約600ms、移動と召喚陣約430ms。攻撃は通常・レジェンドとも移動135ms、着弾の残光480msに統一する。
短い演出や端末の動きを減らす設定では重いCanvas演出を起動せず、既存の短い表示を使う。
画像の読み込みが遅い場合も、既存CSSと描画可能な図形で進行し、ゲーム処理を素材待ちで止めない。
描画はrequestAnimationFrameで行い、DOMが外れた場合は次フレームで止まる。演出レイヤーは入力を受け取らない。
デバイス比率は最大1.5、着色キャッシュは96枚、同時着弾対象は12に制限する。
画面の拡大縮小では毎フレーム盤面と対象の位置を読み直す。

再取り込み
Python 3とPillowを用意し、2つの配布ZIPを取得して以下を実行。
python scripts/import-vfx.py --spritecanvas-zip <effects.zip> --kenney-zip <kenney_particlePack.zip>

テスト
node --test tests/battle-vfx.test.js
node --test tests/battle-vfx.e2e.js
