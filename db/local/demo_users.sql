-- Solo sviluppo locale: corrisponde agli utenti dei seed demo.
insert into auth.users (id, email) values
  ('d2f92fe1-b85e-5b91-a491-82aa18b4a1b3', 'chiara.ferrari@oasi-demo.it'),
  ('5f655e71-8172-508d-af44-a93a96aae29f', 'elena.martinelli@oasi-demo.it'),
  ('107a50a7-9df3-5496-8e61-01afe781288e', 'valentina.rossi@oasi-demo.it'),
  ('2ec93360-d268-512d-80c3-e286b1d628bb', 'giulia.bianchi@email-demo.it'),
  ('f99ad25f-f8ba-5444-82b9-3b259bae3b20', 'sofia.galli@email-demo.it'),
  ('83625569-c7e6-5902-b38c-2a847d243375', 'martina.conti@email-demo.it'),
  ('1ad5d7b3-8d6a-596f-93b7-294ee648e7de', 'alice.ricci@email-demo.it'),
  ('a92f1f4e-d33e-5585-9a20-1b282e2ee8ac', 'francesca.moretti@email-demo.it'),
  ('68ffc4e8-8a0f-5269-84bf-d3c0df4dad3e', 'sara.lombardi@email-demo.it'),
  ('e2ef5456-0217-5736-b494-243e99b333f4', 'beatrice.marchetti@email-demo.it'),
  ('e2c17ba9-992d-5a18-9408-f49034028f0c', 'anna.barbieri@email-demo.it'),
  ('3f25524a-2851-5e80-a65c-2d5023399f8f', 'elisa.fontana@email-demo.it'),
  ('d32e92dc-4c88-5cee-9c8b-d240a181f6a1', 'camilla.santoro@email-demo.it'),
  ('6fa23207-0c94-5f90-bed6-7f58f97fb584', 'noemi.rinaldi@email-demo.it'),
  ('05b32713-4679-5964-9bc1-21a437ee057f', 'ilaria.gatti@email-demo.it'),
  ('7e35a51f-0777-50f3-85ee-6f3d9e5c4a73', 'lucia.ferraresi@email-demo.it'),
  ('8ba231f0-2dc2-5645-bd6e-526bf66c3ed5', 'greta.pellacani@email-demo.it'),
  ('2273fd1d-c960-515f-906c-afe114b15848', 'segreteria@oasi-demo.it'),
  ('6dc5ff5c-3344-56ae-8858-e47777110447', 'marta@studio-prova.example'),
  ('96566281-de4e-537d-9c3f-510f8154898f', 'laura@studio-prova.example')
on conflict do nothing;
