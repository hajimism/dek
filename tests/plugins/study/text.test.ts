import { expect, test } from "bun:test";
import { slideText } from "../../../src/plugins/study/text.ts";

test("reads the words a reader sees, as one line", async () => {
  const html = `<section class="slide">
  <h1>計画<strong>錯誤</strong></h1>
  <p>楽観的に見積もる傾向に、
     外部視点 で対抗する</p>
</section>`;
  expect(await slideText(html)).toBe("計画錯誤 楽観的に見積もる傾向に、 外部視点 で対抗する");
});

test("leaves out what no reader sees: scripts, styles, templates, and comments", async () => {
  const html = `<section class="slide"><style>.x{}</style><script>let a = "外部視点"</script><template>外部視点</template><!-- 外部視点 --><p>見える</p></section>`;
  expect(await slideText(html)).toBe("見える");
});

test("reads a character reference as the character", async () => {
  expect(await slideText("<p>A &amp; B &lt;C&gt; &#x5916;&#37096;</p>")).toBe("A & B <C> 外部");
});
