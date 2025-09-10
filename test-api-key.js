import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

async function diagnoseAccount() {
  const API_KEY = process.env.LIGHTX_API_KEY;

  console.log("🔍 LightX Account Diagnostic");
  console.log(
    "API Key Format:",
    API_KEY ? `${API_KEY.substring(0, 20)}...` : "MISSING"
  );

  try {
    const response = await fetch(
      "https://api.lightxeditor.com/external/api/v2/uploadImageUrl",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          uploadType: "imageUrl",
          size: 1000,
          contentType: "image/jpeg",
        }),
      }
    );

    console.log(`\n📊 Response Status: ${response.status}`);
    const responseText = await response.text();
    console.log("📊 Response Body:", responseText);

    if (response.status === 200) {
      console.log("\n🎉 SUCCESS! Your account now has Face Swap access!");
      console.log("✅ Your face swap application should work perfectly!");
    } else if (response.status === 403) {
      console.log("\n❌ STILL FORBIDDEN - Account upgrade needed");
      console.log("💡 Next Steps:");
      console.log("   1. Upgrade to LightX Pro subscription");
      console.log("   2. Contact LightX support for manual approval");
      console.log("   3. Verify billing and payment status");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

diagnoseAccount();
