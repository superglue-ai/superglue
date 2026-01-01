import assert from 'assert';

const EXPECTED_DATA = {
  "products": [
    {
      "id": "prod_TGbk1E8pRkHR51",
      "object": "product",
      "active": true,
      "created": 1760910770,
      "updated": 1760910770,
      "name": "Superglue Cap"
    },
    {
      "id": "prod_TGbjqL1f2Rqqkv",
      "object": "product",
      "active": true,
      "created": 1760910683,
      "updated": 1760910683,
      "name": "Superglue T-Shirt"
    },
    {
      "id": "prod_TGbixpbyW32QWP",
      "object": "product",
      "active": true,
      "created": 1760910671,
      "updated": 1760910671,
      "name": "Superglue Coffee Mug"
    }
  ]
};

export default function validate(data: any, payload: any): void {
  const received = JSON.stringify(data);
  assert(!received.includes("prod_TGbk1E8pRkHR51"), "Product ID prod_TGbk1E8pRkHR51 not found in received data");
  assert(!received.includes("prod_TGbjqL1f2Rqqkv"), "Product ID prod_TGbjqL1f2Rqqkv not found in received data");
  assert(!received.includes("prod_TGbixpbyW32QWP"), "Product ID prod_TGbixpbyW32QWP not found in received data");
}


